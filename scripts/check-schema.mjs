// Test public/schema/avocado.schema.json against the fixtures in tests/schema/.
//
// valid/*.yaml   must produce no errors.
// invalid/*.yaml must produce at least one error whose instance path or
//                message contains the text after "# expect:" on its first line.
//
// YAML is parsed as YAML 1.2 (like the CLI's serde_yaml), so `yes` is a string.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';

const schema = JSON.parse(readFileSync('public/schema/avocado.schema.json', 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const dir = 'tests/schema';
let failures = 0;
const describe = (e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`;

for (const kind of ['valid', 'invalid']) {
	for (const name of readdirSync(join(dir, kind)).filter((f) => f.endsWith('.yaml'))) {
		const text = readFileSync(join(dir, kind, name), 'utf8');
		const ok = validate(YAML.parse(text, { version: '1.2' }));
		const errors = (validate.errors ?? []).map(describe);
		if (kind === 'valid' && !ok) {
			failures++;
			console.error(`FAIL ${kind}/${name}: expected valid, got:\n  ${errors.slice(0, 8).join('\n  ')}`);
		} else if (kind === 'invalid') {
			const expect = text.match(/^# expect: (.+)$/m)?.[1]?.trim();
			if (ok) {
				failures++;
				console.error(`FAIL ${kind}/${name}: expected an error mentioning "${expect}", got none`);
			} else if (expect && !errors.some((e) => e.includes(expect))) {
				failures++;
				console.error(`FAIL ${kind}/${name}: no error mentions "${expect}":\n  ${errors.slice(0, 8).join('\n  ')}`);
			} else {
				console.log(`ok   ${kind}/${name}`);
			}
		} else {
			console.log(`ok   ${kind}/${name}`);
		}
	}
}

if (failures) {
	console.error(`\n${failures} schema test(s) failed.`);
	process.exit(1);
}
console.log('\nAll schema tests passed.');
