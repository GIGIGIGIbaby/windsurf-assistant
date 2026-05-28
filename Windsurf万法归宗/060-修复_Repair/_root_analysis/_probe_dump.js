// Dump raw bytes for debugging
"use strict";

const crypto = require("node:crypto");
const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const codec = require(ROOT + "\\proto-codec.js");

const mid = crypto.randomUUID();

// Build minimal chatMsg with F10 prompt (where we suspect breakage)
const prompt = codec.encodeMessage(10, [
  codec.encodeString(1, mid),
  codec.encodeVarintField(2, 1),
  codec.encodeString(3, "hi"),
]);
console.log("prompt:", prompt.length, "bytes:", prompt.toString("hex"));

// Decode prompt to verify structure
console.log("\nDecoding prompt buffer:");
const fields = codec.parseProto(prompt);
console.log("Fields seen:", Object.keys(fields));
for (const [k, v] of Object.entries(fields)) {
  console.log(`  field ${k}: wire=${v[0].wire}, ${v[0].bytes ? "len=" + v[0].bytes.length + " hex=" + Buffer.from(v[0].bytes).toString("hex") : "value=" + v[0].value}`);
}

// HMM — encodeMessage(10, [...]) places everything as if they're TOP-LEVEL fields,
// but F10 is the FIELD of an OUTER message.
// So encodeMessage(10, [...]) creates a field where field=10 contains an inner-message-bytes.
// The "inner" should be the encoded body of ChatMessagePrompt.

// Let me parse the OUTER (so we expect to see only field 10):
// But wait, the prompt buffer IS field 10 itself. So parseProto on it sees field 10 as an entry.

// chatMsg
const chatMsg = codec.encodeMessage(2, [
  codec.encodeString(1, mid),
  codec.encodeVarintField(2, 1),
  prompt,  // this is encoded at F10
]);
console.log("\nchatMsg:", chatMsg.length, "bytes");
console.log("chatMsg hex:", chatMsg.toString("hex"));

// Parse chatMsg as a top-level
console.log("\nDecoding chatMsg as top-level:");
const cmFields = codec.parseProto(chatMsg);
for (const [k, v] of Object.entries(cmFields)) {
  console.log(`  field ${k}: wire=${v[0].wire}, ${v[0].bytes ? "len=" + v[0].bytes.length : "value=" + v[0].value}`);
}

// Hmm. chatMsg starts with `12 <len> <inner>` where inner has F1, F2, F10.
// So at top level we see only field 2.
// Let's parse the inner of chatMsg (skip the F2 header) to see the actual ChatMessage fields.
const chatMsgInner = cmFields[2][0].bytes;
console.log("\nchatMsg INNER (should be ChatMessage's fields):");
const innerFields = codec.parseProto(Buffer.from(chatMsgInner));
for (const [k, v] of Object.entries(innerFields)) {
  console.log(`  field ${k}: wire=${v[0].wire}, ${v[0].bytes ? "len=" + v[0].bytes.length + " hex=" + Buffer.from(v[0].bytes).toString("hex") : "value=" + v[0].value}`);
}

console.log("\n→ Look at field 10 — that should be ChatMessagePrompt INSIDE ChatMessage.");
if (innerFields[10]) {
  const promptBytes = Buffer.from(innerFields[10][0].bytes);
  console.log("  field 10 (ChatMessagePrompt) bytes:", promptBytes.length, "hex:", promptBytes.toString("hex"));
  const promptFields = codec.parseProto(promptBytes);
  console.log("  Decoded ChatMessagePrompt fields:");
  for (const [k, v] of Object.entries(promptFields)) {
    console.log(`    field ${k}: wire=${v[0].wire}, ${v[0].bytes ? "len=" + v[0].bytes.length : "value=" + v[0].value}`);
  }
}
