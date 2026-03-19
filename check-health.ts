async function checkHealth() {
  try {
    const res = await fetch('http://localhost:3000/api/health');
    const data = await res.json();
    console.log('HEALTH CHECK:', data);
    
    const supRes = await fetch('http://localhost:3000/api/debug/supabase/b58ce466-5065-4211-bc38-c5f7e471d4a9');
    const supData = await supRes.json();
    console.log('SUPABASE PROFILE:', JSON.stringify(supData, null, 2));
  } catch (err) {
    console.error('HEALTH CHECK FAILED:', err);
  }
}
checkHealth();
