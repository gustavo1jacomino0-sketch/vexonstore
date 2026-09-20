/*
 * VEXON STORE — CONFIGURAÇÃO DO SUPABASE
 *
 * Cole aqui os dados públicos do seu projeto Supabase.
 * NÃO coloque a chave service_role neste arquivo.
 * Para o navegador, use a Publishable key (sb_publishable_...) ou a anon key
 * disponibilizada pelo seu projeto.
 */

const SUPABASE_URL = 'https://npivsnxqvoezopfckxne.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PlURjeg69zmx8JbLkFszFg_lxYka4a4';

const supabaseClient = window.supabase?.createClient ? window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
) : null;

window.vexonSupabase = supabaseClient;
window.VEXON_SUPABASE_CONFIGURED = Boolean(supabaseClient);
supabaseClient?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') window.VEXON_RECOVERY = true;
  if (event === 'SIGNED_OUT') window.VEXON_RECOVERY = false;
});
