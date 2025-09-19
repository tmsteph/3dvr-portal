// navbar.js
// DO NOT re-create Gun or user here!
// Just use the global one from index.html.

function createNavbar() {
  const nav = document.createElement('div');
  nav.className = 'floating-identity';
  nav.setAttribute('aria-label', 'Account status');

  const stats = document.createElement('div');
  stats.className = 'floating-identity__stats';

  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'floating-identity__label';

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'floating-identity__value';

  stats.appendChild(usernameSpan);
  stats.appendChild(scoreSpan);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'floating-identity__button';
  button.innerText = 'Sign Out';

  button.addEventListener('click', () => {
    user.leave();
    localStorage.removeItem('signedIn');
    localStorage.removeItem('guest');
    localStorage.removeItem('username');
    localStorage.removeItem('password');
    window.location.href = 'index.html';
  });

  nav.appendChild(stats);
  nav.appendChild(button);
  document.body.appendChild(nav);

  const signedIn = localStorage.getItem('signedIn');
  const guest = localStorage.getItem('guest');

  if (signedIn) {
    user.get('alias').on(alias => {
      usernameSpan.innerText = `👤 ${alias || 'Loading...'}`;
    });
    user.get('score').on(score => {
      scoreSpan.innerText = `⭐ ${score || 0}`;
    });
  } else if (guest) {
    const guestId = localStorage.getItem('guestId') || (() => {
      const id = 'guest_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('guestId', id);
      return id;
    })();
    const guestProfile = gun.get('3dvr-guests').get(guestId);

    guestProfile.get('username').on(name => {
      usernameSpan.innerText = `👤 ${name || 'Guest'}`;
    });
    guestProfile.get('score').on(score => {
      scoreSpan.innerText = `⭐ ${score || 0}`;
    });
  } else {
    usernameSpan.innerText = '👤 Guest';
    scoreSpan.innerText = '⭐ 0';
  }
}

window.addEventListener('load', createNavbar);
