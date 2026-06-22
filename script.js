/* ============================================================
   IMPOSSIBLE FORMS — Shared Script
   ============================================================ */

(function () {
  'use strict';

  /* ── Mobile nav toggle ──────────────────────────────────── */
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
      toggle.querySelectorAll('span').forEach((bar, i) => {
        bar.style.transform = open
          ? i === 0 ? 'translateY(7px) rotate(45deg)'
          : i === 1 ? 'scaleX(0)'
          : 'translateY(-7px) rotate(-45deg)'
          : '';
        bar.style.opacity = open && i === 1 ? '0' : '';
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.site-nav') && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelectorAll('span').forEach(bar => {
          bar.style.transform = '';
          bar.style.opacity = '';
        });
      }
    });
  }

  /* ── Mirror text easter egg ─────────────────────────────── */
  const mirrorEls = document.querySelectorAll('.mirror-text');
  mirrorEls.forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('revealed');
    });
    // Also keyboard accessible
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Reveal hidden message');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.classList.toggle('revealed');
      }
    });
  });

  /* ── Scroll reveal ──────────────────────────────────────── */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReduced) {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      reveals.forEach(el => observer.observe(el));
    }
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  /* ── Candlelight ambient cursor glow (homepage only) ────── */
  if (document.body.dataset.page === 'home' && !prefersReduced) {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'border-radius:50%',
      'width:320px',
      'height:320px',
      'background:radial-gradient(circle,rgba(212,167,70,0.06) 0%,transparent 70%)',
      'transform:translate(-50%,-50%)',
      'transition:left 0.6s ease,top 0.6s ease',
      'z-index:0',
      'left:-100px',
      'top:-100px',
    ].join(';');
    document.body.appendChild(glow);

    document.addEventListener('mousemove', (e) => {
      glow.style.left = e.clientX + 'px';
      glow.style.top  = e.clientY + 'px';
    });
  }

  /* ── Subtle candle flicker on gold headings ─────────────── */
  if (!prefersReduced) {
    const brand = document.querySelector('.nav-wordmark');
    if (brand) {
      brand.style.animation = 'flicker 8s infinite';
    }
  }

  /* ── Current page nav highlight ─────────────────────────── */
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const hrefFile = href.split('/').pop();
    if (hrefFile === path || (path === '' && hrefFile === 'index.html')) {
      a.setAttribute('aria-current', 'page');
    }
  });

})();
