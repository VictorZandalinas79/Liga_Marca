const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data } = await supabase.from('fixtures').select('id, matchday, status, name, start_time').in('id', ['72e6g9h1pn6n02wyh6hi1e49g', '71l2f5qull2yzqxy409ojb2tw', '70smcigm7ttqaz8fv6xsf87bo', '7if2ke5uop0iqrl0k7fhs7uhg'])
  console.log(data)
}
test()
