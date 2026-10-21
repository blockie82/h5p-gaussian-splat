// Generates libraries/H5P.GaussianSplat-1.0/language/.en.json from semantics.json
import fs from 'node:fs';
const dir = 'libraries/H5P.GaussianSplat-1.0';
const semantics = JSON.parse(fs.readFileSync(`${dir}/semantics.json`, 'utf8'));
const strip = (field) => {
  const out = {};
  if (field.label !== undefined) out.label = field.label;
  if (field.description !== undefined) out.description = field.description;
  if (field.type === 'text' && field.default !== undefined && field.widget !== 'colorSelector') out.default = field.default;
  if (field.options) out.options = field.options.map((o) => ({ label: o.label }));
  if (field.fields) out.fields = field.fields.map(strip);
  if (field.field) out.field = strip(field.field);
  return out;
};
fs.writeFileSync(`${dir}/language/.en.json`, JSON.stringify({ semantics: semantics.map(strip) }, null, 2) + '\n');
