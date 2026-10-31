import config from './rollup.config.js';
import fs from 'fs';
import path from 'path';
const packageOf = filename => {
 let directory=path.dirname(filename);
 while(directory!==path.dirname(directory)) {
  const candidate=path.join(directory,'package.json');
  if(fs.existsSync(candidate)) {const pkg=JSON.parse(fs.readFileSync(candidate,'utf8'));return {name:pkg.name,version:pkg.version,root:directory,license:pkg.license,author:pkg.author,contributors:pkg.contributors,repository:pkg.repository};}
  directory=path.dirname(directory);
 }
};
config.plugins.push({name:'audit-bundled-modules',generateBundle(options,bundle){
 const used=Object.values(bundle).filter(item=>item.type==='chunk').flatMap(chunk=>Object.entries(chunk.modules).map(([id,value])=>({id,...value}))).filter(item=>item.renderedLength>0);
 const modules=used.filter(item=>!item.id.startsWith('\0')).map(item=>({...item,package:packageOf(item.id)}));
 fs.writeFileSync('audit-modules.json',JSON.stringify(modules,null,2));
}});
export default config;
