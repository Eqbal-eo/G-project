import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml, splitTableRow } from '../src/lib/markdown.js';
import { keepWritingInOpenPage, asksForNewPage, AGENT_INSTRUCTIONS, needsWriteFollowUp, writeFollowUpPrompt } from '../supabase/functions/_shared/agentContract.js';

test('turns a Markdown table into a real table, with alignment', () => {
  const html = markdownToHtml('## Truth Table\n| p | q | p ∧ q |\n| --- | :---: | ---: |\n| T | T | T |\n| T | F | F |\n\nAfter **bold**');
  assert.equal(
    html,
    '<h2>Truth Table</h2><table class="editor-simple-table"><thead><tr><th>p</th><th style="text-align:center">q</th><th style="text-align:right">p ∧ q</th></tr></thead>'
      + '<tbody><tr><td>T</td><td style="text-align:center">T</td><td style="text-align:right">T</td></tr><tr><td>T</td><td style="text-align:center">F</td><td style="text-align:right">F</td></tr></tbody></table>'
      + '<p>After <strong>bold</strong></p>'
  );
});

test('reads the truth table the AI actually wrote (no gaps, many columns)', () => {
  const markdown = [
    '| p | q | r | p ∧ q | p ∨ q | p → q | p ⇔ q |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| T | T | T | T | T | T | T |',
    '| F | F | F | F | F | T | T |'
  ].join('\n');
  const html = markdownToHtml(markdown);
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.equal((html.match(/<th>/g) || []).length, 7);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
  assert.doesNotMatch(html, /---/);
});

test('table edge cases: missing separator, short and long rows, escaping', () => {
  assert.match(markdownToHtml('| a | b |\n| 1 | 2 |'), /^<table class="editor-simple-table"><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>$/);
  const ragged = markdownToHtml('| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |');
  assert.match(ragged, /<tr><td>1<\/td><td>2<\/td><td><br><\/td><\/tr>/);
  assert.match(ragged, /<tr><td>1<\/td><td>2<\/td><td>3<\/td><\/tr>/);
  assert.doesNotMatch(markdownToHtml('| x | <img src=x onerror=alert(1)> |\n|---|---|\n| **b** | `c` |'), /<img/);
  assert.match(markdownToHtml('| x | y |\n|---|---|\n| **b** | `c` |'), /<td><strong>b<\/strong><\/td><td><code>c<\/code><\/td>/);
  assert.deepEqual(splitTableRow(String.raw`| x \| y | z |`), ['x | y', 'z']);
  assert.equal(markdownToHtml('just | a pipe | here'), '<p>just | a pipe | here</p>');
  assert.equal(markdownToHtml('| only one row |'), '<p>| only one row |</p>');
});

test('the agent is told to write into the open page and to use Markdown tables', () => {
  assert.match(AGENT_INSTRUCTIONS, /OPEN PAGE/);
  assert.match(AGENT_INSTRUCTIONS, /append_to_page on THAT page/);
  assert.match(AGENT_INSTRUCTIONS, /\| --- \| --- \|/);
  assert.doesNotMatch(AGENT_INSTRUCTIONS, /no tables/);
});

test('recognises an explicit request for a new page (English and Arabic)', () => {
  for (const prompt of ['Create a new page with a truth table', 'put it in a separate page', 'make a page for the notes', 'أنشئ صفحة فيها جدول', 'اكتبها في صفحة جديدة', 'create a new project for this']) {
    assert.equal(asksForNewPage(prompt), true, prompt);
  }
  for (const prompt of ['create truth table (p q r)', 'add a table of the results', 'write a summary', 'أنشئ جدول الصدق', 'اكتب ملخص للدرس']) {
    assert.equal(asksForNewPage(prompt), false, prompt);
  }
});

test('keeps written content in the open page unless a new page was asked for', () => {
  const plan = { reply: 'Done', actions: [{ type: 'create_page', ref: 'NEW1', title: 'Truth Table', content: '| p | q |\n|---|---|\n| T | F |' }] };
  const kept = keepWritingInOpenPage(plan, { openPage: 'G3', prompt: 'create truth table (p q r)' });
  assert.deepEqual(kept.actions, [{ type: 'append_to_page', page: 'G3', content: '## Truth Table\n\n| p | q |\n|---|---|\n| T | F |' }]);
  assert.equal(kept.reply, 'Done');

  // A heading that already names the title is not repeated.
  const titled = keepWritingInOpenPage({ actions: [{ type: 'create_page', title: 'Summary', content: '## Summary\n- one' }] }, { openPage: 'G3', prompt: 'summarize' });
  assert.equal(titled.actions[0].content, '## Summary\n- one');

  // No open page, an explicit new page, or a whole new project: leave the plan alone.
  assert.equal(keepWritingInOpenPage(plan, { openPage: null, prompt: 'create truth table' }), plan);
  assert.equal(keepWritingInOpenPage(plan, { openPage: 'G3', prompt: 'create a new page with a truth table' }), plan);
  const project = { actions: [{ type: 'create_project', ref: 'NEW1', title: 'Thesis' }, { type: 'create_page', ref: 'NEW2', title: 'Plan', project: 'NEW1', content: 'x' }] };
  assert.equal(keepWritingInOpenPage(project, { openPage: 'G3', prompt: 'plan my thesis' }), project);

  // Other actions are untouched.
  const mixed = keepWritingInOpenPage({ actions: [{ type: 'create_task', title: 'Check table', project: 'P1' }, { type: 'append_to_page', page: 'G3', content: 'x' }] }, { openPage: 'G3', prompt: 'add a task' });
  assert.deepEqual(mixed.actions.map((action) => action.type), ['create_task', 'append_to_page']);
});

test('asks again when a writing request comes back as only a sentence', () => {
  const noAction = (reply) => ({ reply, actions: [] });
  // What happened in practice: a promise or a description, and no action.
  assert.equal(needsWriteFollowUp('اكتب برنامج بلغة جافا يحسب بقوانين التكامل والتفاضل', noAction('I will create a new page with Java code that calculates integral and differential equations.')), true);
  assert.equal(needsWriteFollowUp('اكتب كود بلغة سي لحساب قوانين التفاضل والتكامل', noAction('I can provide you with an example of a C code that calculates basic differential and integral rules.')), true);
  assert.equal(needsWriteFollowUp('write a C program that computes derivatives', noAction('Sure.')), true);
  // A promise counts even when the wording of the request is unusual.
  assert.equal(needsWriteFollowUp('Java calculus please', noAction('I will create a page with the program.')), true);
  // Not when actions came back, the reply already holds the code, or it was a question.
  assert.equal(needsWriteFollowUp('write code', { reply: 'Done', actions: [{ type: 'create_page' }] }), false);
  assert.equal(needsWriteFollowUp('write code', noAction('```java\nclass A {}\n```')), false);
  assert.equal(needsWriteFollowUp('what is overdue?', noAction('Two tasks are overdue.')), false);
  assert.equal(needsWriteFollowUp('ما هي المهام المتأخرة؟', noAction('There are two overdue tasks.')), false);
  assert.equal(needsWriteFollowUp('how do I write a for loop in C?', noAction('Use for (int i = 0; i < n; i++).')), false);
});

test('the follow-up asks for the full content in the right action', () => {
  assert.match(writeFollowUpPrompt('اكتب برنامج جافا', 'G8'), /^اكتب برنامج جافا\n\nIMPORTANT: .*ONE append_to_page action on page G8/s);
  assert.match(writeFollowUpPrompt('write a C program'), /ONE create_page action/);
  assert.ok(writeFollowUpPrompt('x'.repeat(5000)).length <= 4000);
  assert.match(AGENT_INSTRUCTIONS, /NEVER say "I will create\/write\/add…" in "reply" without including that action/);
});
