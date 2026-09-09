(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('[data-toggle-password]').forEach(function(btn){
      var input=document.getElementById(btn.dataset.togglePassword);
      if(!input) return;
      btn.addEventListener('click', function(){
        var visible=input.type==='text';
        input.type=visible?'password':'text';
        btn.textContent=visible?'👁':'🙈';
        btn.setAttribute('aria-label', visible?'Exibir senha':'Ocultar senha');
        btn.title=visible?'Exibir senha':'Ocultar senha';
      });
    });
  });
})();
