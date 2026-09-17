import test from 'node:test';
import assert from 'node:assert/strict';
import {Chat} from '@ai-sdk/react';
import {createUIMessageStream} from 'ai';
import {chatMessageIds} from '../../lib/ai/config.mjs';

test('SDK keeps the user message alongside assistant deltas, including follow-ups',async()=>{
  let release;
  let hold=new Promise(resolve=>{release=resolve;});
  const chat=new Chat({
    transport:{
      async sendMessages({messages}) {
        const id=chatMessageIds(messages.at(-1).id).assistant;
        return createUIMessageStream({execute:async({writer})=>{
          writer.write({type:'start',messageId:id});
          writer.write({type:'text-start',id:'text'});
          writer.write({type:'text-delta',id:'text',delta:'Partial answer'});
          await hold;
          writer.write({type:'text-delta',id:'text',delta:' completed.'});
          writer.write({type:'text-end',id:'text'});
          writer.write({type:'finish',finishReason:'stop'});
        }});
      },
      async reconnectToStream(){return null;},
    },
  });
  for(const [index,prompt] of ['My first SaaS question','My follow-up'].entries()){
    const pending=chat.sendMessage({text:prompt});
    try {
      for(let n=0;n<100 && chat.status!=='streaming';n++) await new Promise(resolve=>setTimeout(resolve,5));
      assert.equal(chat.status,'streaming');
      assert.equal(chat.messages.length,(index+1)*2);
      assert.equal(chat.messages.at(-2).role,'user');
      assert.equal(chat.messages.at(-2).parts[0].text,prompt);
      assert.equal(chat.messages.at(-1).parts[0].text,'Partial answer');
      assert.equal(new Set(chat.messages.map(m=>m.id)).size,chat.messages.length);
    } finally {release();await pending;}
    assert.equal(chat.messages.at(-1).parts[0].text,'Partial answer completed.');
    hold=new Promise(resolve=>{release=resolve;});
  }
});
