/**
 * Standalone test: run ensureDocWalletTemplate against a real doc
 * and print what happens at each step.
 *
 * Usage:  npx tsx scripts/test-template.ts
 */
import "dotenv/config";
import { createGoogleAuth } from "../src/google/auth.js";
import { createDocsClient, createDriveClient } from "../src/google/clients.js";
import { getDoc, findAnchor, findNextTable, paragraphPlainText } from "../src/google/docs.js";
import { listAccessibleDocs } from "../src/google/drive.js";
import {
  DOCWALLET_CONFIG_ANCHOR,
  DOCWALLET_COMMANDS_ANCHOR,
  DOCWALLET_CHAT_ANCHOR,
  DOCWALLET_BALANCES_ANCHOR,
  DOCWALLET_OPEN_ORDERS_ANCHOR,
  DOCWALLET_RECENT_ACTIVITY_ANCHOR,
  DOCWALLET_SESSIONS_ANCHOR,
  DOCWALLET_AUDIT_ANCHOR,
  ensureDocWalletTemplate
} from "../src/google/template.js";

async function main() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var required");

  const auth = await createGoogleAuth(saJson, [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.readonly"
  ]);
  const docs = createDocsClient(auth);
  const drive = createDriveClient(auth);

  let docId = process.env.DOCWALLET_DOC_ID?.trim();
  if (!docId) {
    const prefix = process.env.DOCWALLET_NAME_PREFIX?.trim() || "[DocWallet]";
    console.log(`No DOCWALLET_DOC_ID set. Discovering docs with prefix "${prefix}"...`);
    const found = await listAccessibleDocs({ drive, namePrefix: prefix });
    console.log(`Found ${found.length} doc(s):`, found.map(f => `${f.name} (${f.id})`));
    if (found.length === 0) throw new Error("No docs found");
    docId = found[0].id;
  }

  console.log(`=== Test template for doc: ${docId} ===\n`);

  // --- Step 1: Dump current doc structure ---
  console.log("--- STEP 1: Current doc structure ---");
  const doc = await getDoc(docs, docId);
  const content = doc.body?.content ?? [];
  console.log(`Total structural elements: ${content.length}`);

  const allAnchors = [
    DOCWALLET_CONFIG_ANCHOR, DOCWALLET_COMMANDS_ANCHOR, DOCWALLET_CHAT_ANCHOR,
    DOCWALLET_BALANCES_ANCHOR, DOCWALLET_OPEN_ORDERS_ANCHOR, DOCWALLET_RECENT_ACTIVITY_ANCHOR,
    DOCWALLET_SESSIONS_ANCHOR, DOCWALLET_AUDIT_ANCHOR
  ];

  // Count occurrences of each anchor
  for (const anchor of allAnchors) {
    let count = 0;
    for (const el of content) {
      if (!el.paragraph) continue;
      if (paragraphPlainText(el.paragraph).trim() === anchor) count++;
    }
    const found = findAnchor(doc, anchor);
    const tableAfter = found ? findNextTable(doc, found.elementIndex) : null;
    console.log(`  ${anchor}: ${count} occurrence(s), findAnchor=${found ? `idx=${found.elementIndex}` : "null"}, tableAfter=${tableAfter ? `idx=${tableAfter.elementIndex}` : "null"}`);
  }

  // Print first 60 elements showing type
  console.log("\n--- Element dump (first 80) ---");
  for (let i = 0; i < Math.min(80, content.length); i++) {
    const el = content[i];
    if (el.paragraph) {
      const text = paragraphPlainText(el.paragraph).trim();
      console.log(`  [${i}] PARA  start=${el.startIndex} end=${el.endIndex}  "${text.slice(0, 60)}"`);
    } else if (el.table) {
      const rows = el.table.tableRows?.length ?? 0;
      const cols = el.table.tableRows?.[0]?.tableCells?.length ?? 0;
      console.log(`  [${i}] TABLE start=${el.startIndex} end=${el.endIndex}  ${rows}x${cols}`);
    } else if (el.sectionBreak) {
      console.log(`  [${i}] SECTION_BREAK`);
    } else {
      console.log(`  [${i}] OTHER start=${el.startIndex} end=${el.endIndex}`);
    }
  }

  // --- Step 2: Try ensureDocWalletTemplate ---
  console.log("\n--- STEP 2: Running ensureDocWalletTemplate ---");
  try {
    const result = await ensureDocWalletTemplate({ docs, docId });
    console.log("SUCCESS! Template created. Sections:");
    for (const [key, val] of Object.entries(result)) {
      const rows = (val as any).table?.tableRows?.length ?? 0;
      const cols = (val as any).table?.tableRows?.[0]?.tableCells?.length ?? 0;
      console.log(`  ${key}: ${rows}x${cols}`);
    }
  } catch (err: any) {
    console.error("FAILED:", err.message);
    if (err.response?.data?.error) {
      console.error("API Error:", JSON.stringify(err.response.data.error, null, 2));
    }
    if (err.errors) {
      console.error("Errors:", JSON.stringify(err.errors, null, 2));
    }
    console.error("Stack:", err.stack);
  }

  // --- Step 3: Dump doc structure after ---
  console.log("\n--- STEP 3: Doc structure AFTER ---");
  const doc2 = await getDoc(docs, docId);
  const content2 = doc2.body?.content ?? [];
  console.log(`Total structural elements: ${content2.length}`);
  for (const anchor of allAnchors) {
    let count = 0;
    for (const el of content2) {
      if (!el.paragraph) continue;
      if (paragraphPlainText(el.paragraph).trim() === anchor) count++;
    }
    const found = findAnchor(doc2, anchor);
    const tableAfter = found ? findNextTable(doc2, found.elementIndex) : null;
    console.log(`  ${anchor}: ${count} occurrence(s), findAnchor=${found ? `idx=${found.elementIndex}` : "null"}, tableAfter=${tableAfter ? `idx=${tableAfter.elementIndex}` : "null"}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
