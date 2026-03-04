import { M2MClient } from '../client.js';
import { loadConfig } from '../config.js';

export async function listMessages(matchId: string) {
  const config = await loadConfig();
  const client = new M2MClient(config);
  const { messages } = await client.getMessages(matchId);
  if (messages.length === 0) {
    console.log('No messages yet.');
    return;
  }
  for (const m of messages) {
    console.log(JSON.stringify(m));
  }
}

export async function sendMessage(matchId: string, payload: string) {
  const config = await loadConfig();
  const client = new M2MClient(config);
  const { message_id } = await client.sendMessage(matchId, payload);
  console.log('Message sent:', message_id);
}
