#!/usr/bin/env node
// One-off conversion of GymMane's food tables (assets/data/foods.tsv and dishes.tsv, GPL-3.0,
// "Based on GymMane by InlitX") into the compact JSON the Nutrition screen loads on demand.
//   node scripts/build-foods.mjs <gymmane/assets/data>   ->  frontend/src/data/foods.json
// The photos (assets/food/*.webp) are copied as they are to frontend/public/food/ — see NOTICE.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = process.argv[2]
if (!src) { console.error('usage: build-foods.mjs <dir with foods.tsv and dishes.tsv>'); process.exit(1) }
// GymMane language column -> this app's pack code. The packs GymMane has no column for (hi, bn, hu,
// th) read the English name.
const LANG = { en: 'en', es: 'es', de: 'de', fr: 'fr', it: 'it', pt: 'pt', pl: 'pl', ru: 'ru', uk: 'uk', tr: 'tr', ko: 'ko', zh: 'zh', zh_Hant: 'zh-TW', ar: 'ar' }
const rows = f => fs.readFileSync(path.join(src, f), 'utf8').split('\n').filter(l => l.trim()).map(l => l.split('\t'))
const num = v => (v === '' || v == null ? 0 : Math.round(Number(v) * 100) / 100 || 0)

const [head, ...body] = rows('foods.tsv')
const col = k => head.indexOf(k)
const foods = body.filter(c => c.length >= 13).map(c => {
  const names = {}
  for (const [g, code] of Object.entries(LANG)) if (c[col(g)]) names[code] = c[col(g)]
  const f = { id: c[0].replace(/^a:/, ''), n: names, k: num(c[col('k')]), p: num(c[col('p')]), c: num(c[col('c')]), f: num(c[col('f')]) }
  for (const [key, h] of [['fi', 'fi'], ['su', 'su'], ['na', 'na']]) if (num(c[col(h)])) f[key] = num(c[col(h)])
  // portion: 'unit' | 'slice' | 'tbsp' | ... and its weight in grams (empty = no household portion)
  if (c[col('kind')] && num(c[col('g')])) { f.kind = c[col('kind')]; f.g = num(c[col('g')]) }
  if (c[col('cat')]) f.cat = c[col('cat')]
  if (c[col('ml')] === '1' || c[col('ml')] === 'true') f.liquid = 1
  return f
})

// GymMane's dish table has English and Spanish only; Portuguese names added here.
const DISH_PT = {"coffee-milk": "Café com leite", "cortado": "Cortado", "cocoa-milk": "Leite com chocolate", "tomato-toast": "Torrada com tomate e azeite", "ham-toast": "Torrada com tomate e presunto", "avocado-toast": "Torrada de abacate com ovo", "pb-toast": "Torrada com pasta de amendoim e banana", "oatmeal": "Aveia com banana", "yogurt-granola": "Iogurte com granola e frutas vermelhas", "scrambled-eggs": "Ovos mexidos", "chicken-rice-broccoli": "Frango, arroz e brócolis", "chicken-rice": "Frango com arroz", "cuban-rice": "Arroz com tomate e ovo frito", "macaroni-tomato": "Macarrão ao molho de tomate", "bolognese": "Espaguete à bolonhesa", "lentil-stew": "Ensopado de lentilha", "chickpeas-spinach": "Grão-de-bico com espinafre", "spanish-omelette": "Tortilha espanhola", "mixed-salad": "Salada mista", "chicken-salad": "Frango grelhado com salada", "salmon-potatoes": "Salmão com batatas", "steak-fries": "Bife com batata frita", "burger": "Cheeseburger", "pizza": "Pizza margherita", "chicken-wrap": "Wrap de frango", "ham-sandwich": "Sanduíche de presunto cru", "ham-cheese-toastie": "Misto quente"}
const [dh, ...db] = rows('dishes.tsv')
const items = dh.indexOf('items')
const dishes = db.map(c => {
  const n = {}
  for (const [g, code] of Object.entries(LANG)) { const i = dh.indexOf(g); if (i > 0 && i < items && c[i]) n[code] = c[i] }
  if (DISH_PT[c[0]]) n.pt = DISH_PT[c[0]]
  return { id: c[0], n, items: c[items].split(' ').map(p => { const [slug, a] = p.split(':'); return [slug, num(a.replace('c', ''))] }) }
})

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src', 'data', 'foods.json')
fs.writeFileSync(out, JSON.stringify({ foods, dishes }))
console.log(`wrote ${foods.length} foods and ${dishes.length} dishes, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`)
