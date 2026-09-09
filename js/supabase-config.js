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

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

window.vexonSupabase = supabaseClient;
window.VEXON_SUPABASE_CONFIGURED = !SUPABASE_URL.includes('COLE_AQUI') && !SUPABASE_PUBLISHABLE_KEY.includes('COLE_AQUI');
