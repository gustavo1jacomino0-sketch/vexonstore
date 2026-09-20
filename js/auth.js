(() => {
  'use strict';
  const client = window.vexonSupabase;
  const safeReturn = () => {
    const fallback = new URL('index.html', location.href);
    try {
      const target = new URL(new URLSearchParams(location.search).get('redirect') || 'index.html', location.href);
      if (target.origin === location.origin && /^\/(?:index\.html|pages\/(?:casa|eletronicos|moda|games|ferramentas)\.html)$/.test(target.pathname)) return target.pathname;
    } catch (_) {}
    return fallback.pathname;
  };
  const message = (text, type = 'error') => {
    const box = document.getElementById('auth-message'); if (!box) return;
    box.textContent = text; box.hidden = !text; box.className = `auth-message ${type}`;
  };
  const friendly = error => {
    if ([429].includes(error?.status)) return 'Muitas tentativas. Aguarde alguns minutos.';
    if (String(error?.code).includes('weak_password')) return 'Escolha uma senha mais forte, com pelo menos 12 caracteres.';
    return 'Não foi possível concluir. Confira os dados e sua conexão e tente novamente.';
  };
  function boot() {
    const login = document.getElementById('login-form'), signup = document.getElementById('signup-form');
    const reset = document.getElementById('reset-form'), update = document.getElementById('update-password-form');
    const forms = document.getElementById('auth-forms'), logged = document.getElementById('logged-panel');
    let recovery = Boolean(window.VEXON_RECOVERY);
    const showTab = name => {
      document.querySelectorAll('[data-auth-panel]').forEach(panel => panel.hidden = panel.dataset.authPanel !== name);
      document.querySelectorAll('[data-auth-tab]').forEach(tab => { tab.classList.toggle('active',tab.dataset.authTab===name); tab.setAttribute('aria-selected',String(tab.dataset.authTab===name)); });
      message('');
    };
    function ui(session, event) {
      const user = session?.user;
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (!user) recovery = false;
      if (forms) {
        forms.hidden = Boolean(user) || recovery;
        logged.hidden = !user || recovery;
        if (recovery) showTab('update');
        else if (update) update.closest('[data-auth-panel]').hidden = true;
        if (document.getElementById('user-email')) document.getElementById('user-email').textContent = user?.email || '';
        if (document.getElementById('user-name')) document.getElementById('user-name').textContent = String(user?.user_metadata?.full_name || 'Cliente Vexon').slice(0,120);
      }
      const account = document.querySelector('[data-account-link]');
      if (account) {
        account.href = location.pathname.includes('/pages/') ? '../auth.html' : 'auth.html';
        const labels = account.querySelectorAll('p');
        if (labels[0]) labels[0].textContent = user ? `Olá, ${String(user.user_metadata?.full_name || 'Cliente').slice(0,60)}` : 'Minha conta';
        if (labels[1]) labels[1].textContent = user ? 'Minha conta' : 'Entrar / Cadastrar';
      }
    }
    document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.addEventListener('click',()=>showTab(tab.dataset.authTab)));
    document.querySelectorAll('[data-forgot-password]').forEach(b=>b.addEventListener('click',()=>showTab('reset')));
    document.querySelectorAll('[data-back-login]').forEach(b=>b.addEventListener('click',()=>showTab('login')));
    if (!client) { message('A conexão com a conta está indisponível. Recarregue a página.'); return; }
    function bind(form, action) {
      form?.addEventListener('submit',async event => {
        event.preventDefault(); if (form.dataset.busy === 'true' || !form.reportValidity()) return;
        const button=form.querySelector('[type=submit]'), original=button.textContent;
        form.dataset.busy='true'; button.disabled=true; button.textContent='Aguarde…'; message('');
        try { await action(form); } catch(error) { message(friendly(error)); }
        finally { form.dataset.busy='false'; button.disabled=false; button.textContent=original; }
      });
    }
    const value = (form,name) => form.elements.namedItem(name).value;
    bind(login, async form => {
      const {error}=await client.auth.signInWithPassword({email:value(form,'email').trim(),password:value(form,'password')});
      if(error) { message(error.status===429?friendly(error):'Não foi possível entrar. Confira e-mail e senha.'); return; }
      location.assign(safeReturn());
    });
    bind(signup, async form => {
      const name=value(form,'full_name').trim(),password=value(form,'password');
      if(name.length<2||name.length>120) { message('Informe um nome entre 2 e 120 caracteres.'); return; }
      if(password.length<12||password.length>128) { message('Use uma senha entre 12 e 128 caracteres.'); return; }
      if(password!==value(form,'password_confirm')) { message('As senhas não coincidem.'); return; }
      const {data,error}=await client.auth.signUp({email:value(form,'email').trim(),password,options:{data:{full_name:name},emailRedirectTo:new URL('auth.html',location.href).href}});
      if(error) { message(friendly(error)); return; }
      form.reset();
      if(data.session) location.assign(safeReturn());
      else message('Solicitação recebida. Confira seu e-mail ou entre se já possui uma conta.','success');
    });
    bind(reset, async form => {
      const {error}=await client.auth.resetPasswordForEmail(value(form,'email').trim(),{redirectTo:new URL('auth.html',location.href).href});
      if(error && (error.status===429||error.status>=500)) throw error;
      message('Se o endereço puder receber a recuperação, enviaremos as instruções.','success');form.reset();
    });
    bind(update, async form => {
      const password=value(form,'password');
      if(!recovery||password.length<12||password.length>128||password!==value(form,'confirm')) { message('Confira as senhas e use o link de recuperação recebido.'); return; }
      const {data,error:sessionError}=await client.auth.getUser();
      if(sessionError||!data.user) throw sessionError||Error('session');
      const {error}=await client.auth.updateUser({password}); if(error)throw error;
      form.reset(); recovery=false; window.VEXON_RECOVERY=false;
      const {error:logoutError}=await client.auth.signOut({scope:'global'});
      if(logoutError) { message('Senha alterada. Não foi possível encerrar todas as sessões; tente sair da conta.','warning'); return; }
      ui(null);showTab('login');message('Senha atualizada. Entre novamente.','success');
      history.replaceState(null,'',location.pathname);
    });
    document.getElementById('logout-button')?.addEventListener('click',async () => {
      try { const {error}=await client.auth.signOut();if(error)throw error;sessionStorage.removeItem('vexon_last_order');location.reload(); }
      catch(error) { message(friendly(error)); }
    });
    client.auth.onAuthStateChange((event,session)=>ui(session,event));
    client.auth.getSession().then(({data})=>ui(data.session)).catch(()=>message('Não foi possível recuperar a sessão.'));
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
