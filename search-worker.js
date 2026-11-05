// Indexed SQLite pages are read on demand. No full-catalogue JSON downloads.
importScripts('vendor/sqlite-http.js');
const normalize = value => value.trim().toLocaleLowerCase();
const names = new Intl.DisplayNames(['en'], {type:'language'});
const codes = {English:'en',Farsi:'fa',Persian:'fa',Punjabi:'pa',Arabic_sa:'ar',
  French_fr:'fr',Spanish_es:'es',Spanish_la:'es',Portuguese_br:'pt',Portuguese_pt:'pt'};
let loading;
let catalogue;
const connections = new Map();

function matchesLanguage(value, query) {
  const code=codes[value]||value;
  const aliases=[value,code];
  if (/^[a-z]{2,3}$/.test(code)) aliases.push(names.of(code),new Intl.DisplayNames([code],{type:'language'}).of(code));
  else aliases.push(value.replaceAll('_',' '));
  if(code==='fa')aliases.push('Farsi','فارسی');
  return aliases.some(alias=>normalize(alias)===query);
}

async function load() {
  loading ||= fetch('catalogue.json',{cache:'no-cache'}).then(response=>{
    if(!response.ok)throw new Error('Could not load the terminology catalogue.');
    return response.json();
  }).then(data=>catalogue=data).catch(error=>{loading=undefined;throw error;});
  return loading;
}

function connection(source) {
  if(!connections.has(source.url)) {
    const promise=createDbWorker([{from:'inline',config:{serverMode:'chunked',requestChunkSize:4096,
      urlPrefix:new URL(source.url,self.location.href).href+'?v='+source.version+'&part=',
      serverChunkSize:source.bytes,databaseLengthBytes:source.bytes,suffixLength:1}}],
      new URL('vendor/sqlite.worker.js',self.location.href).href,
      new URL('vendor/sql-wasm.wasm',self.location.href).href)
      .catch(error=>{connections.delete(source.url);throw error;});
    connections.set(source.url,promise);
  }
  return connections.get(source.url);
}

async function query(source,sql,params=[]) {
  return (await connection(source)).db.query(sql,params);
}

async function cards(source,rows) {
  return Promise.all(rows.map(async row=>{
    const stream=new Blob([row.payload]).stream().pipeThrough(new DecompressionStream('gzip'));
    const entry=JSON.parse(await new Response(stream).text());
    return {other_terms:[],follow_up_questions:[],follow_up_questions_original:[],...source.defaults,...entry};
  }));
}

async function search({query:text,language,translationRequested}) {
  const term=normalize(text);
  const english=await Promise.all(catalogue.map(source=>query(source,
    'SELECT entry FROM terms WHERE term=? AND english=1 LIMIT 1',[term])));
  const translated=english.some(rows=>rows.length);
  if(translated&&(!translationRequested||!language.trim()))return {entries:[],translated};
  const groups=await Promise.all(catalogue.map(async source=>{
    if(translated) {
      const selected=source.languages.filter(value=>matchesLanguage(value,normalize(language)));
      if(!selected.length)return [];
      const placeholders=selected.map(()=>'?').join(',');
      const rows=await query(source,`SELECT e.id,e.payload FROM entries e WHERE e.id IN (
        SELECT t.entry FROM terms t JOIN entries x ON x.id=t.entry
          WHERE t.term=? AND t.english=1 AND x.language IN (${placeholders})
        UNION SELECT target.id FROM terms t JOIN entries x ON x.id=t.entry
          JOIN entries target ON target.concept=x.concept
          WHERE t.term=? AND t.english=1 AND x.concept<>''
          AND target.language IN (${placeholders})) ORDER BY e.id LIMIT 5`,[term,...selected,term,...selected]);
      return cards(source,rows);
    }
    const rows=await query(source,`SELECT e.payload FROM terms t JOIN entries e ON e.id=t.entry
      WHERE t.term=? ORDER BY e.id LIMIT 5`,[term]);
    return cards(source,rows);
  }));
  let entries=[].concat(...groups);
  if(!translated&&!entries.length) {
    const tokens=text.match(/[\p{L}\p{N}]+/gu)||[];
    if(tokens.length) {
      const expression=tokens.map(token=>'"'+token+'"*').join(' AND ');
      const candidates=await Promise.all(catalogue.map(async source=>{
        const rows=await query(source,`SELECT e.payload FROM entries e JOIN (
          SELECT rowid FROM search WHERE search MATCH ? ORDER BY rank LIMIT 5
        ) s ON e.id=s.rowid`,[expression]);
        return cards(source,rows);
      }));
      importScripts('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0');
      const fuse=new Fuse([].concat(...candidates),{
        keys:['original_phrase','aliases','transliteration','literal_translation','possible_english_term','other_terms'],
        includeScore:true,threshold:0.25,ignoreLocation:true});
      entries=fuse.search(text).filter(result=>result.score<=0.25).map(result=>result.item);
    }
  }
  const seen=new Set();
  entries=entries.filter(entry=>{
    const key=JSON.stringify([entry.original_phrase,entry.possible_english_term,entry.plain_language_meaning]);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  return {entries:entries.slice(0,5),translated};
}

self.onmessage=async({data})=>{
  try {
    await load();
    let response;
    if(data.action==='search')response=await search(data);
    else if(data.action==='lucky') {
      let index=Math.floor(Math.random()*catalogue.reduce((sum,source)=>sum+source.count,0));
      for(const source of catalogue) {
        if(index<source.count) {
          response={entries:await cards(source,await query(source,'SELECT payload FROM entries WHERE id=?',[index+1]))};break;
        }
        index-=source.count;
      }
    } else if(data.action==='browse') {
      let offset=data.offset;
      const entries=[];
      for(const source of catalogue) {
        if(offset>=source.count){offset-=source.count;continue;}
        const rows=await query(source,'SELECT payload FROM entries WHERE id>? ORDER BY id LIMIT ?',[offset,50-entries.length]);
        entries.push(...await cards(source,rows));offset=0;
        if(entries.length===50)break;
      }
      response={entries,hasMore:data.offset+entries.length<catalogue.reduce((sum,source)=>sum+source.count,0)};
    } else if(data.action==='stats') {
      response={stats:await Promise.all(catalogue.map(async source=>({source:source.url,...await(await connection(source)).worker.getStats()})))};
    } else throw new Error('Unknown search action.');
    self.postMessage({id:data.id,languages:[...new Set(catalogue.flatMap(source=>source.languages))],...response});
  } catch(error){self.postMessage({id:data.id,error:error.message});}
};
