/** A keyboard-first packing idea tree. Conversion always creates existing
 * TravelIt packing records; there is no second persistent packing database.
 */
export const STARTER_BRANCHES=[
 {group:'Documents',category:'Essentials'},
 {group:'Clothing & footwear',category:'Clothing'},
 {group:'Toiletries & first aid',category:'Personal care'},
 {group:'Electronics & navigation',category:'Electronics'},
 {group:'Family essentials',category:'Family'},
 {group:'Sleep & shelter',category:'Other'},
 {group:'Food & cooking',category:'Other'},
 {group:'Other gear',category:'Other'}
];
const CATEGORY_SET=new Set(['Essentials','Clothing','Personal care','Electronics','Family','Other']);
export function collectPackingTree(root,existing=[]){
 if(!root?.querySelectorAll)throw Error('Packing map is unavailable.');
 const seen=new Set(existing.map(x=>String(x.label||'').trim().toLocaleLowerCase()));
 const items=[],skipped=[];
 for(const branch of root.querySelectorAll('[data-pack-tree-branch]')){
  const group=String(branch.querySelector('[data-pack-tree-group]')?.value||'').trim().slice(0,70)||'Other';
  const category=CATEGORY_SET.has(branch.dataset.category)?branch.dataset.category:'Other';
  for(const input of branch.querySelectorAll('[data-pack-tree-item]')){
   const label=String(input.value||'').replace(/^[•*\s-]+/,'').trim();
   if(!label)continue;
   if(label.length>150)throw Error('Packing item names must be 150 characters or fewer.');
   const key=label.toLocaleLowerCase();
   if(seen.has(key)){skipped.push(label);continue;}
   seen.add(key);items.push({label,category,group,quantity:1});
   if(items.length>60)throw Error('Generate up to 60 new packing items at a time.');
  }
 }
 return {items,skipped};
}
function element(tag,props={}){
 const node=document.createElement(tag);
 for(const [k,v] of Object.entries(props)){
  if(k==='text')node.textContent=v;
  else if(k==='class')node.className=v;
  else if(k==='value')node.value=v;
  else node.setAttribute(k,v);
 }
 return node;
}
function addItem(branch,after=null){
 const list=branch.querySelector('[data-pack-tree-items]');
 const row=element('div',{class:'pack-tree-item'});
 const input=element('input',{type:'text','data-pack-tree-item':'',placeholder:'Add an item',maxlength:'150','aria-label':'Packing idea'});
 const remove=element('button',{type:'button',class:'pack-tree-remove','data-pack-tree-remove-item':'','aria-label':'Remove idea',text:'×'});
 row.append(input,remove);
 if(after?.parentElement===list)after.after(row);else list.append(row);
 input.focus();
 return input;
}
export function addPackingBranch(tree,group='New group',category='Other'){
 const branch=element('section',{class:'pack-tree-branch','data-pack-tree-branch':'','data-category':CATEGORY_SET.has(category)?category:'Other'});
 const top=element('div',{class:'pack-tree-branch-head'});
 const title=element('input',{type:'text',class:'pack-tree-name','data-pack-tree-group':'',value:group,maxlength:'70','aria-label':'Packing group'});
 const plus=element('button',{type:'button',class:'pack-tree-add','data-pack-tree-add-item':'',title:'Add item',text:'+'});
 const remove=element('button',{type:'button',class:'pack-tree-remove','data-pack-tree-remove-branch':'',title:'Remove group',text:'×'});
 top.append(title,plus,remove);
 const list=element('div',{class:'pack-tree-items','data-pack-tree-items':''});
 branch.append(top,list);
 tree.append(branch);
 addItem(branch);
 return branch;
}
export function wirePackingTree(root){
 if(!root)return;
 root.addEventListener('click',event=>{
  const btn=event.target.closest('button');
  if(!btn||!root.contains(btn))return;
  if(btn.hasAttribute('data-pack-tree-add-branch')){
   const branch=addPackingBranch(root.querySelector('[data-pack-tree-branches]'));
   branch.querySelector('[data-pack-tree-group]').focus();
   branch.querySelector('[data-pack-tree-group]').select();
  }else if(btn.hasAttribute('data-pack-tree-add-item')){
   addItem(btn.closest('[data-pack-tree-branch]'));
  }else if(btn.hasAttribute('data-pack-tree-remove-item')){
   const branch=btn.closest('[data-pack-tree-branch]');
   const row=btn.closest('.pack-tree-item');
   const input=row.querySelector('input');
   const fallback=row.previousElementSibling?.querySelector('input')||row.nextElementSibling?.querySelector('input');
   row.remove();if(fallback)fallback.focus();else addItem(branch);
  }else if(btn.hasAttribute('data-pack-tree-remove-branch')){
   btn.closest('[data-pack-tree-branch]').remove();
  }
 });
 root.addEventListener('keydown',event=>{
  const target=event.target;
  if(!target?.hasAttribute('data-pack-tree-item'))return;
  if(event.key==='Enter'){
   event.preventDefault();
   const row=target.closest('.pack-tree-item'),branch=target.closest('[data-pack-tree-branch]');
   addItem(branch,row);
  }else if(event.key==='Backspace'&&!target.value){
   const row=target.closest('.pack-tree-item');
   if(row.parentElement.children.length>1){
    event.preventDefault();
    const prev=row.previousElementSibling?.querySelector('input')||row.nextElementSibling?.querySelector('input');
    row.remove();prev?.focus();
   }
  }
 });
}
