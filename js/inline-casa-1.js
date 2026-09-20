
(function(){
 const modal=document.getElementById('email-contact-modal'), form=document.getElementById('contact-email-form');
 if(!modal||!form)return;
 const open=()=>{modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.classList.add('vexon-drawer-open');document.getElementById('contact-sender-email')?.focus()};
 const close=()=>{modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('vexon-drawer-open')};
 document.querySelectorAll('[data-open-contact-email]').forEach(b=>b.addEventListener('click',open));
 document.querySelectorAll('[data-close-contact-email]').forEach(b=>b.addEventListener('click',close));
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('is-open'))close()});
 form.addEventListener('submit',e=>{e.preventDefault();const sender=document.getElementById('contact-sender-email').value.trim(),subject=document.getElementById('contact-subject').value.trim(),message=document.getElementById('contact-message').value.trim();const body='E-mail do cliente: '+sender+'\n\nMensagem:\n'+message;window.location.href='mailto:vexonstore00@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);});
})();
