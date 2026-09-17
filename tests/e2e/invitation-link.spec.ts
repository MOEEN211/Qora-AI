import {test,expect} from '@playwright/test'
test.use({baseURL:'http://127.0.0.1:3000',trace:'off',screenshot:'off',video:'off'})
test('invalid invitation fragment resolves without logging a token in the URL',async({page})=>{
  const events:string[]=[]
  page.on('request',request=>{if(new URL(request.url()).pathname==='/invite')events.push(`request ${request.method()}`)})
  page.on('response',response=>{if(new URL(response.url()).pathname==='/invite')events.push(`response ${response.status()}`)})
  page.on('pageerror',error=>events.push(error.message.replace(/[0-9a-f]{64}/g,'[redacted]')))
  try {
    await page.goto(`/invite#token=${'0'.repeat(64)}`)
    await expect(page.getByRole('status')).toContainText('expired',{timeout:20000})
    expect(new URL(page.url()).hash).toBe('')
  } finally {console.log('Invitation navigation events:',events)}
})
