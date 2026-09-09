(function () {
  'use strict';

  const client = window.vexonSupabase;
  const configured = window.VEXON_SUPABASE_CONFIGURED;

  const authPath = () => {
    const fromPages = window.location.pathname.includes('/pages/');
    return fromPages ? '../auth.html' : 'auth.html';
  };

  function getRedirectUrl() {
    const origin = window.location.origin;
    if (!origin || origin === 'null') return '';
    return `${origin}${window.location.pathname.includes('/pages/') ? '/auth.html' : '/auth.html'}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function friendlyError(error) {
    const message = (error && error.message) ? error.message : 'Não foi possível concluir a operação.';
    const lower = message.toLowerCase();

    if (lower.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (lower.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
    if (lower.includes('user already registered')) return 'Este e-mail já possui uma conta.';
    if (lower.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (lower.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (lower.includes('invalid email')) return 'Digite um e-mail válido.';
    return message;
  }

  function setMessage(text, type) {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.textContent = text || '';
    box.className = `auth-message ${type || ''}`;
    box.hidden = !text;
  }

  function setLoading(button, loadingText, loading) {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      button.classList.add('is-loading');
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  function setupAuthPage() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const resetForm = document.getElementById('reset-form');
    const loggedPanel = document.getElementById('logged-panel');
    const authForms = document.getElementById('auth-forms');
    const tabs = document.querySelectorAll('[data-auth-tab]');
    const logoutButton = document.getElementById('logout-button');
    const userEmail = document.getElementById('user-email');
    const userName = document.getElementById('user-name');

    if (!loginForm || !signupForm) return;

    if (!configured) {
      setMessage('O Supabase ainda não foi configurado. Abra js/supabase-config.js e cole a URL e a chave pública do seu projeto.', 'warning');
    }

    function showTab(tab) {
      document.querySelectorAll('[data-auth-panel]').forEach(panel => {
        panel.hidden = panel.dataset.authPanel !== tab;
      });
      tabs.forEach(button => {
        button.classList.toggle('active', button.dataset.authTab === tab);
      });
      setMessage('', '');
    }

    tabs.forEach(button => button.addEventListener('click', () => showTab(button.dataset.authTab)));

    document.querySelectorAll('[data-forgot-password]').forEach(button => {
      button.addEventListener('click', () => showTab('reset'));
    });

    document.querySelectorAll('[data-back-login]').forEach(button => {
      button.addEventListener('click', () => showTab('login'));
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!configured) return setMessage('Configure primeiro a URL e a chave pública no arquivo js/supabase-config.js.', 'error');

      const button = loginForm.querySelector('button[type="submit"]');
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;
      setMessage('', '');
      setLoading(button, 'Entrando...', true);

      const { error } = await client.auth.signInWithPassword({ email, password });
      setLoading(button, 'Entrando...', false);

      if (error) return setMessage(friendlyError(error), 'error');
      setMessage('Login realizado com sucesso!', 'success');
      setTimeout(() => window.location.href = 'index.html', 500);
    });

    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!configured) return setMessage('Configure primeiro a URL e a chave pública no arquivo js/supabase-config.js.', 'error');

      const button = signupForm.querySelector('button[type="submit"]');
      const name = signupForm.full_name.value.trim();
      const email = signupForm.email.value.trim();
      const password = signupForm.password.value;
      const confirm = signupForm.password_confirm.value;

      if (name.length < 2) return setMessage('Digite seu nome completo.', 'error');
      if (password.length < 6) return setMessage('A senha precisa ter pelo menos 6 caracteres.', 'error');
      if (password !== confirm) return setMessage('As senhas não coincidem.', 'error');

      setMessage('', '');
      setLoading(button, 'Criando conta...', true);

      const options = { data: { full_name: name } };
      const redirectUrl = getRedirectUrl();
      if (redirectUrl) options.emailRedirectTo = redirectUrl;

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options
      });

      setLoading(button, 'Criando conta...', false);

      if (error) return setMessage(friendlyError(error), 'error');

      if (data.session) {
        setMessage('Conta criada e login realizado com sucesso!', 'success');
        setTimeout(() => window.location.href = 'index.html', 700);
      } else {
        setMessage('Conta criada! Enviamos um link para confirmar seu e-mail. Depois da confirmação, você poderá entrar.', 'success');
        signupForm.reset();
      }
    });

    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!configured) return setMessage('Configure primeiro a URL e a chave pública no arquivo js/supabase-config.js.', 'error');

      const button = resetForm.querySelector('button[type="submit"]');
      const email = resetForm.email.value.trim();
      setMessage('', '');
      setLoading(button, 'Enviando...', true);

      const redirectUrl = getRedirectUrl();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl || undefined
      });

      setLoading(button, 'Enviando...', false);
      if (error) return setMessage(friendlyError(error), 'error');
      setMessage('Se existir uma conta com esse e-mail, enviaremos as instruções para redefinir a senha.', 'success');
      resetForm.reset();
    });

    async function updateSessionUI(session) {
      const user = session && session.user;
      if (!user) {
        authForms.hidden = false;
        loggedPanel.hidden = true;
        return;
      }

      authForms.hidden = true;
      loggedPanel.hidden = false;
      if (userEmail) userEmail.textContent = user.email || '';
      if (userName) userName.textContent = user.user_metadata?.full_name || 'Cliente Vexon';
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        if (!configured) return;
        const { error } = await client.auth.signOut();
        if (error) return setMessage(friendlyError(error), 'error');
        window.location.reload();
      });
    }

    client.auth.getSession().then(({ data }) => updateSessionUI(data.session));
    client.auth.onAuthStateChange((_event, session) => updateSessionUI(session));
  }

  async function updateAccountLink() {
    const accountLink = document.querySelector('a[href="#conta"], a[data-account-link]');
    if (!accountLink) return;

    accountLink.href = authPath();

    if (!configured) return;

    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user) return;

    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Minha conta';
    const textBlocks = accountLink.querySelectorAll('p');
    if (textBlocks[0]) textBlocks[0].textContent = `Olá, ${name}`;
    if (textBlocks[1]) textBlocks[1].textContent = 'Minha conta';
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupAuthPage();
    updateAccountLink();
  });
})();
