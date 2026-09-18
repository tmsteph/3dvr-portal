const intro=document.querySelector('.card'),session=document.querySelector('#session');
document.querySelector('#continue').addEventListener('click',()=>{intro.hidden=true;session.hidden=false});
document.querySelector('#done').addEventListener('click',()=>{session.hidden=true;intro.hidden=false;document.querySelector('h1').textContent='Done';document.querySelector('.why').textContent='Control returned to your agent.';document.querySelector('#continue').hidden=true});
