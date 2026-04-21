/**
 * IMADETHEARK — main.js  v3.0 (smooth pass)
 *
 * v3 perf fixes over v2.1:
 *  - Cursor:    dirty-flag — DOM writes ONLY when mouse moved or ring still settling
 *               mouseover/mouseout → mouseenter/mouseleave on specific elements (no bubbling)
 *  - Cards:     rect cached on mouseenter, NOT re-read inside RAF
 *  - Magnetic:  rect cached on mouseenter, NOT re-read on mousemove
 *  - Lenis:     own RAF loop, decoupled from GSAP ticker (removes double-RAF)
 *  - Shimmer:   background-position animation removed from CSS (paint-per-frame trap)
 *               replaced with GPU-only opacity breathe via JS class toggle
 *  - Reveals:   batch IntersectionObserver (single shared observer, not one per element)
 */

(function () {
    'use strict';

    /* ── boot ────────────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', init);

    // Hard safety: always unlock the page after 4s regardless of CDN state
    setTimeout(forceUnlock, 4000);

    function forceUnlock() {
        document.documentElement.classList.remove('ark-loading');
        var loader = document.getElementById('arkLoader');
        if (loader) { loader.style.opacity = '0'; loader.style.pointerEvents = 'none'; loader.style.display = 'none'; }
        document.body.style.overflow = '';
    }

    function init() {
        if (typeof gsap === 'undefined') {
            console.warn('[ARK] GSAP not loaded — running without animations');
            forceUnlock();
            return;
        }
        gsap.registerPlugin(ScrollTrigger);

        initLenis();
        initLoader();
        initCursor();
        initNav();
        initHeroAnimations();
        initScrollReveals();
        initCounters();
        initMagneticButtons();
        initCardInteraction();
        initMarqueeHover();
        initTimelineDrag();
        initButtonRipple();
        initPageTransitions();
        initGooeyText();
    }


    /* ══════════════════════════════════════════════════════════════════════════
       1. LENIS — own RAF, NOT bridged through GSAP ticker
          Bridging added Lenis onto every GSAP tick (60fps Lenis + 60fps GSAP).
          Own RAF lets each run independently and avoids double-scheduling.
       ══════════════════════════════════════════════════════════════════════════ */
    let lenis;

    function initLenis() {
        if (typeof window.Lenis === 'undefined') return;

        lenis = new window.Lenis({
            duration: 1.1,
            easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smooth: true,
            smoothTouch: false,
            syncTouch: false,
        });

        // Standalone RAF — no GSAP ticker involvement
        function lenisLoop(ts) {
            lenis.raf(ts);
            requestAnimationFrame(lenisLoop);
        }
        requestAnimationFrame(lenisLoop);

        // Tell ScrollTrigger about Lenis scroll position
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.lagSmoothing(0);

        window.arkLenis = lenis;
    }


    /* ══════════════════════════════════════════════════════════════════════════
       2. LOADING SCREEN
       ══════════════════════════════════════════════════════════════════════════ */

    function initLoader() {
        const loader = document.getElementById('arkLoader');
        const bar    = document.getElementById('arkLoaderBar');
        const count  = document.getElementById('arkLoaderCount');
        const words  = document.querySelectorAll('.ark-loader__word');

        if (!document.documentElement.classList.contains('ark-loading') || !loader) {
            setTimeout(animateHeroEntrance, 80);
            return;
        }

        const prog = { val: 0 };
        const tl   = gsap.timeline({
            onComplete() {
                if (window.sessionStorage) sessionStorage.setItem('ark-loaded', '1');
                document.documentElement.classList.remove('ark-loading');
                animateHeroEntrance();
            }
        });

        tl.to(prog, {
            val: 100, duration: 1.8, ease: 'power2.inOut',
            onUpdate() {
                const v = Math.round(prog.val);
                if (count) count.textContent = v;
                if (bar)   bar.style.width = v + '%';
            }
        }, 0);

        tl.to(words, { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out' }, 0.2);
        tl.to(loader, { y: '-100%', duration: 0.8, ease: 'power3.inOut' }, '+=0.3');
        tl.set(loader, { display: 'none' });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       3. CUSTOM CURSOR — dirty-flag: DOM writes only when movement exists
          Previously wrote to DOM every frame even when mouse was motionless.
          Now: dot writes on mousemove only; ring writes while still settling.
       ══════════════════════════════════════════════════════════════════════════ */

    function initCursor() {
        const cursor = document.getElementById('arkCursor');
        if (!cursor || window.matchMedia('(hover: none)').matches) {
            if (cursor) cursor.style.display = 'none';
            return;
        }

        const dot  = cursor.querySelector('.ark-cursor__dot');
        const ring = cursor.querySelector('.ark-cursor__ring');

        let mx = -200, my = -200;  // off-screen start
        let rx = -200, ry = -200;
        let dotNeedsUpdate  = false;
        let ringSettling    = false;

        document.addEventListener('mousemove', e => {
            mx = e.clientX;
            my = e.clientY;
            dotNeedsUpdate = true;
            ringSettling   = true;
        }, { passive: true });

        function cursorLoop() {
            requestAnimationFrame(cursorLoop);

            // Dot — write only when mouse moved
            if (dotNeedsUpdate) {
                dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
                dotNeedsUpdate = false;
            }

            // Ring — lerp toward cursor, stop writing once settled
            if (ringSettling) {
                rx += (mx - rx) * 0.11;
                ry += (my - ry) * 0.11;
                ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;

                // Stop once ring is within 0.1px of cursor
                if (Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1) {
                    ringSettling = false;
                }
            }
        }
        cursorLoop();

        // ── State classes — mouseenter/leave on specific els (no bubbling) ───
        // Group 1: draggable
        document.querySelectorAll('.ark-timeline').forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('is-drag'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('is-drag'));
        });

        // Group 2: cards
        document.querySelectorAll('.ark-feature-card, li.product, .ark-split__visual, .ark-product-card').forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('is-hovering'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('is-hovering'));
        });

        // Group 3: links/buttons (only direct matches, not parents)
        document.querySelectorAll('a, button, .ark-btn, input[type="submit"]').forEach(el => {
            el.addEventListener('mouseenter', () => {
                if (!cursor.classList.contains('is-drag') && !cursor.classList.contains('is-hovering')) {
                    cursor.classList.add('is-link');
                }
            });
            el.addEventListener('mouseleave', () => cursor.classList.remove('is-link'));
        });

        // Click feedback
        document.addEventListener('mousedown', () => cursor.classList.add('is-clicking'));
        document.addEventListener('mouseup',   () => cursor.classList.remove('is-clicking'));
    }


    /* ══════════════════════════════════════════════════════════════════════════
       4. NAV
       ══════════════════════════════════════════════════════════════════════════ */

    function initNav() {
        const nav = document.querySelector('.site-header, #masthead, header.header');
        if (!nav) return;

        let lastY = 0;
        // Minimum scroll delta before toggling hide — prevents flickering on
        // elastic bounces, micro-jitter, and Lenis easing overshoots
        const HIDE_THRESHOLD = 8;

        function onScroll({ scroll: y }) {
            const delta = y - lastY;

            nav.classList.toggle('ark-nav-scrolled', y > 60);

            if (delta > HIDE_THRESHOLD && y > 200) {
                // Scrolling down far enough — hide
                nav.classList.add('ark-nav-hidden');
            } else if (delta < -HIDE_THRESHOLD) {
                // Scrolling up far enough — show
                nav.classList.remove('ark-nav-hidden');
            }
            // Small deltas: do nothing — stops bounce glitching

            lastY = y;
        }

        if (lenis) {
            // Use Lenis scroll — position matches what user sees on screen
            lenis.on('scroll', onScroll);
        } else {
            // Fallback for no-Lenis environments
            window.addEventListener('scroll', () => {
                onScroll({ scroll: window.scrollY });
            }, { passive: true });
        }
    }


    /* ══════════════════════════════════════════════════════════════════════════
       5. HERO ANIMATIONS
       ══════════════════════════════════════════════════════════════════════════ */

    function initHeroAnimations() {
        // Target the actual hero photo — .ark-hero__photo img or legacy .ark-hero__bg / .hero-bg
        document.querySelectorAll('.ark-hero__photo img, .ark-hero__bg, .hero-bg').forEach(img => {
            img.style.willChange = 'transform';
            gsap.to(img, {
                yPercent: 14, ease: 'none',
                scrollTrigger: {
                    trigger: img.closest('section') || img,
                    start: 'top top', end: 'bottom top',
                    scrub: 1.5,
                    fastScrollEnd: true,
                }
            });
        });
    }

    function animateHeroEntrance() {
        const eyebrow   = document.querySelector('.ark-hero__eyebrow');
        const gooeyWrap = document.querySelector('.ark-gooey-wrap');
        const lines     = document.querySelectorAll('.ark-hero__title-inner');
        const sub       = document.querySelector('.ark-hero__sub');
        const ctas      = document.querySelector('.ark-hero__ctas');
        const indicator = document.querySelector('.ark-scroll-indicator');

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        if (eyebrow)    tl.to(eyebrow,    { opacity: 1, y: 0,    duration: 0.55 }, 0.1);
        // Gooey wrap fades in as the centrepiece — scale from slightly small
        if (gooeyWrap)  tl.fromTo(gooeyWrap,
            { opacity: 0, scale: 0.93 },
            { opacity: 1, scale: 1,    duration: 0.9, ease: 'power2.out' }, 0.15);
        if (lines.length) tl.to(lines,   { yPercent: 0,          duration: 0.8, stagger: 0.1 }, 0.3);
        if (sub)        tl.to(sub,        { opacity: 1, y: 0,    duration: 0.65 }, 0.6);
        if (ctas)       tl.to(ctas,       { opacity: 1, y: 0,    duration: 0.55 }, 0.75);
        if (indicator)  tl.to(indicator,  { opacity: 1,          duration: 0.45 }, 1.1);
    }


    /* ══════════════════════════════════════════════════════════════════════════
       6. SCROLL REVEALS — single shared IntersectionObserver
          Previously: one observer per element. Now: one observer for all.
       ══════════════════════════════════════════════════════════════════════════ */

    function initScrollReveals() {
        // Auto-tag
        [
            '.ark-eyebrow', '.ark-heading', '.ark-subhead',
            '.ark-feature-card', '.ark-testimonial', '.ark-stat',
            '.ark-split__visual', '.ark-split__body',
            'li.product', '.ark-product-card',
        ].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el.closest('.ark-hero, .hero-section') && !el.hasAttribute('data-ark-reveal')) {
                    el.setAttribute('data-ark-reveal', 'true');
                }
            });
        });

        const toReveal = [...document.querySelectorAll('[data-ark-reveal]')];
        if (!toReveal.length) return;

        // One shared observer — much cheaper than N individual observers
        const revealObs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el  = entry.target;
                const dir = el.getAttribute('data-ark-reveal');

                el.style.willChange = 'opacity, transform';

                const from =
                    dir === 'left'  ? { opacity: 0, x: -32 } :
                    dir === 'right' ? { opacity: 0, x:  32 } :
                    dir === 'scale' ? { opacity: 0, scale: 0.92 } :
                    dir === 'fade'  ? { opacity: 0 } :
                                      { opacity: 0, y: 24 };

                gsap.fromTo(el, from, {
                    opacity: 1, y: 0, x: 0, scale: 1,
                    duration: 0.75, ease: 'power3.out',
                    onComplete() {
                        el.style.willChange = 'auto';
                        el.classList.add('ark-revealed');
                    }
                });

                revealObs.unobserve(el);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

        toReveal.forEach(el => revealObs.observe(el));

        // Stagger groups
        document.querySelectorAll('[data-ark-stagger]').forEach(parent => {
            const kids = [...parent.querySelectorAll('[data-ark-reveal]')];
            if (!kids.length) return;

            const staggerObs = new IntersectionObserver(entries => {
                if (!entries[0].isIntersecting) return;
                gsap.fromTo(kids,
                    { opacity: 0, y: 24 },
                    { opacity: 1, y: 0, duration: 0.65, stagger: 0.09, ease: 'power3.out' }
                );
                staggerObs.unobserve(parent);
            }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });

            staggerObs.observe(parent);
        });

        // Parallax — split visuals only (1–2 elements max)
        document.querySelectorAll('.ark-split__visual img').forEach(img => {
            gsap.to(img, {
                yPercent: -8, ease: 'none',
                scrollTrigger: {
                    trigger: img.closest('.ark-split__visual'),
                    start: 'top bottom', end: 'bottom top',
                    scrub: true, fastScrollEnd: true,
                }
            });
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       7. COUNTERS
       ══════════════════════════════════════════════════════════════════════════ */

    function initCounters() {
        const els = document.querySelectorAll('.ark-stat__number');
        if (!els.length) return;

        const obs = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el     = entry.target;
                const raw    = el.textContent.trim();
                const suffix = raw.replace(/[\d.,]/g, '');
                const target = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
                const float  = raw.includes('.');
                if (!target) return;

                el.textContent = '0' + suffix;
                const o = { v: 0 };
                gsap.to(o, {
                    v: target, duration: 1.8, ease: 'power2.out',
                    onUpdate() {
                        el.textContent = (float ? o.v.toFixed(1) : Math.round(o.v)) + suffix;
                    }
                });
                obs.unobserve(el);
            });
        }, { threshold: 0.5 });

        els.forEach(el => obs.observe(el));
    }


    /* ══════════════════════════════════════════════════════════════════════════
       8. MAGNETIC BUTTONS — rect cached on mouseenter, not on every mousemove
       ══════════════════════════════════════════════════════════════════════════ */

    function initMagneticButtons() {
        if (window.matchMedia('(hover: none)').matches) return;

        document.querySelectorAll('.ark-btn').forEach(btn => {
            const wrap = document.createElement('div');
            wrap.className = 'ark-btn-magnetic';
            btn.parentNode.insertBefore(wrap, btn);
            wrap.appendChild(btn);

            let cached  = null;  // rect cached on enter
            let pending = false;
            let dx = 0, dy = 0;

            wrap.addEventListener('mouseenter', () => {
                cached = wrap.getBoundingClientRect(); // read rect ONCE on enter
            });

            wrap.addEventListener('mousemove', e => {
                if (!cached) return;
                dx = (e.clientX - (cached.left + cached.width  / 2)) * 0.3;
                dy = (e.clientY - (cached.top  + cached.height / 2)) * 0.3;

                if (!pending) {
                    pending = true;
                    requestAnimationFrame(() => {
                        btn.style.transform = `translate(${dx}px,${dy}px)`;
                        pending = false;
                    });
                }
            }, { passive: true });

            wrap.addEventListener('mouseleave', () => {
                cached = null;
                btn.style.transition = 'transform 0.65s cubic-bezier(0.34,1.56,0.64,1)';
                btn.style.transform  = 'translate(0,0)';
            });

            wrap.addEventListener('mouseenter', () => {
                btn.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1)';
            });
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       9. CARD INTERACTION — tilt + spotlight
          Rect cached on mouseenter; NOT read inside RAF.
          3D tilt via CSS vars (--tx/--ty) — no inline style.transform clash.
       ══════════════════════════════════════════════════════════════════════════ */

    function initCardInteraction() {
        if (window.matchMedia('(hover: none)').matches) return;

        document.querySelectorAll(
            'li.product, .ark-feature-card, .ark-testimonial, .ark-product-card'
        ).forEach(card => {
            let rect    = null;
            let nx = 0, ny = 0, px = 0, py = 0;
            let pending = false;
            let inside  = false;

            card.addEventListener('mouseenter', () => {
                inside = true;
                rect   = card.getBoundingClientRect(); // read ONCE on enter
                card.style.willChange = 'transform';
            });

            card.addEventListener('mousemove', e => {
                if (!rect) return;
                // Raw normalised coords (-1 → +1) from cached rect
                nx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
                ny = ((e.clientY - rect.top)  / rect.height) * 2 - 1;
                px = ((e.clientX - rect.left) / rect.width)  * 100;
                py = ((e.clientY - rect.top)  / rect.height) * 100;

                if (!pending) {
                    pending = true;
                    requestAnimationFrame(() => {
                        pending = false;
                        if (!inside) return;
                        // Write tilt via CSS custom properties — cheaper than inline transform
                        // because it doesn't invalidate composited layer boundaries
                        card.style.setProperty('--tilt-x', `${-ny * 3.5}deg`);
                        card.style.setProperty('--tilt-y', `${nx * 5}deg`);
                        card.style.setProperty('--mouse-x', `${px}%`);
                        card.style.setProperty('--mouse-y', `${py}%`);
                    });
                }
            }, { passive: true });

            card.addEventListener('mouseleave', () => {
                inside  = false;
                pending = false;
                rect    = null;
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
                setTimeout(() => { card.style.willChange = 'auto'; }, 650);
            });
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       10. MARQUEE — pause on hover
       ══════════════════════════════════════════════════════════════════════════ */

    function initMarqueeHover() {
        document.querySelectorAll('.ark-marquee-section').forEach(section => {
            const track = section.querySelector('.ark-marquee-track, #arkMarquee');
            if (!track) return;
            section.addEventListener('mouseenter', () => track.style.animationPlayState = 'paused');
            section.addEventListener('mouseleave', () => track.style.animationPlayState = 'running');
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       11. TIMELINE DRAG
       ══════════════════════════════════════════════════════════════════════════ */

    function initTimelineDrag() {
        document.querySelectorAll('.ark-timeline').forEach(el => {
            let isDown = false, startX = 0, scrollX = 0, velX = 0, prevX = 0, raf;

            el.addEventListener('mousedown', e => {
                isDown  = true;
                startX  = e.pageX - el.offsetLeft;
                scrollX = el.scrollLeft;
                prevX   = e.pageX;
                cancelAnimationFrame(raf);
                el.style.cursor = 'grabbing';
            });

            const end = () => {
                if (!isDown) return;
                isDown = false;
                el.style.cursor = 'grab';
                (function decay() {
                    velX *= 0.9;
                    if (Math.abs(velX) < 0.4) return;
                    el.scrollLeft -= velX;
                    raf = requestAnimationFrame(decay);
                })();
            };

            el.addEventListener('mouseleave', end);
            el.addEventListener('mouseup', end);
            el.addEventListener('mousemove', e => {
                if (!isDown) return;
                e.preventDefault();
                velX = e.pageX - prevX;
                prevX = e.pageX;
                el.scrollLeft = scrollX - (e.pageX - el.offsetLeft - startX) * 1.4;
            });

            let txStart = 0;
            el.addEventListener('touchstart', e => { txStart = e.touches[0].clientX; scrollX = el.scrollLeft; }, { passive: true });
            el.addEventListener('touchmove', e => { el.scrollLeft = scrollX + (txStart - e.touches[0].clientX); }, { passive: true });
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       12. BUTTON RIPPLE
       ══════════════════════════════════════════════════════════════════════════ */

    function initButtonRipple() {
        document.querySelectorAll('.ark-btn, .woocommerce button.button, input[type="submit"]').forEach(btn => {
            btn.addEventListener('click', e => {
                const rect = btn.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height) * 2;
                const r = document.createElement('span');
                r.className = 'ark-ripple';
                r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
                btn.appendChild(r);
                r.addEventListener('animationend', () => r.remove(), { once: true });
            });
        });
    }


    /* ══════════════════════════════════════════════════════════════════════════
       13. PAGE TRANSITIONS
       ══════════════════════════════════════════════════════════════════════════ */

    function initPageTransitions() {
        const overlay = document.createElement('div');
        overlay.className = 'ark-transition-overlay';
        document.body.appendChild(overlay);

        document.addEventListener('click', e => {
            const link = e.target.closest('a[href]');
            if (!link) return;
            const h = link.getAttribute('href') || '';
            if (!h || h.startsWith('#') || h.startsWith('http') ||
                h.startsWith('tel') || h.startsWith('mailto') ||
                link.target) return;

            e.preventDefault();
            gsap.fromTo(overlay,
                { scaleY: 0, transformOrigin: 'bottom' },
                { scaleY: 1, duration: 0.45, ease: 'power3.inOut',
                  onComplete: () => { window.location.href = link.href; }
                }
            );
        });

        gsap.fromTo(overlay,
            { scaleY: 1, transformOrigin: 'top' },
            { scaleY: 0, duration: 0.55, delay: 0.04, ease: 'power3.inOut' }
        );
    }


    /* ══════════════════════════════════════════════════════════════════════════
       14. WC TOAST
       ══════════════════════════════════════════════════════════════════════════ */

    (function () {
        function showToast() {
            let t = document.querySelector('.ark-toast');
            if (!t) {
                t = document.createElement('div');
                t.className = 'ark-toast';
                t.innerHTML = '<span class="ark-toast__dot"></span><span>Added to cart</span>';
                document.body.appendChild(t);
            }
            t.classList.add('ark-toast--visible');
            gsap.fromTo(t, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
            clearTimeout(t._t);
            t._t = setTimeout(() => {
                gsap.to(t, { y: 8, opacity: 0, duration: 0.3, ease: 'power2.in',
                    onComplete: () => t.classList.remove('ark-toast--visible') });
            }, 2600);
        }
        document.body.addEventListener('wc_fragments_refreshed', showToast);
        document.querySelectorAll('.single_add_to_cart_button, .add_to_cart_button')
            .forEach(b => b.addEventListener('click', () => setTimeout(showToast, 500)));
    })();


    /* ══════════════════════════════════════════════════════════════════════════
       15. RESIZE
       ══════════════════════════════════════════════════════════════════════════ */

    let _rt;
    window.addEventListener('resize', () => {
        clearTimeout(_rt);
        _rt = setTimeout(() => ScrollTrigger.refresh(), 250);
    }, { passive: true });


    /* ══════════════════════════════════════════════════════════════════════════
       16. GOOEY TEXT MORPH
           Vanilla port of the GooeyText React component.
           Same RAF loop · same SVG threshold filter · same blur/opacity math.
           Words rotate through IMADETHEARK manufacturing capabilities.
       ══════════════════════════════════════════════════════════════════════════ */

    function initGooeyText() {
        const text1 = document.getElementById('arkGooeyText1');
        const text2 = document.getElementById('arkGooeyText2');
        if (!text1 || !text2) return;

        const words = [
            'UNIFORMS',
            'SCHOOL KITS',
            'STREETWEAR',
            'CORPORATE WEAR',
            'SPORTS KITS',
            'CUSTOM MERCH',
            'PRIVATE LABEL',
            'BUILT FOR YOU'
        ];

        const MORPH_TIME    = 1;      // seconds to morph between words
        const COOLDOWN_TIME = 2.0;    // seconds to hold a word before morphing

        let textIndex = words.length - 1;
        let then      = performance.now();
        let morph     = 0;
        let cooldown  = COOLDOWN_TIME;

        // Seed first pair
        text1.textContent = words[textIndex % words.length];
        text2.textContent = words[(textIndex + 1) % words.length];

        function applyMorph(fraction) {
            // Clamp away from 0 to avoid division-by-zero (blur(Infinity))
            const f   = Math.max(fraction, 0.003);
            const inv = Math.max(1 - fraction, 0.003);
            // text2 fades in — cap blur at 16px (GPU budget)
            text2.style.filter  = `blur(${Math.min(8 / f - 8, 16)}px)`;
            text2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
            // text1 fades out
            text1.style.filter  = `blur(${Math.min(8 / inv - 8, 16)}px)`;
            text1.style.opacity = `${Math.pow(1 - fraction, 0.4) * 100}%`;
        }

        function holdWord() {
            morph               = 0;
            text2.style.filter  = '';
            text2.style.opacity = '100%';
            text1.style.filter  = '';
            text1.style.opacity = '0%';
        }

        function tick(now) {
            requestAnimationFrame(tick);
            if (document.hidden) return;   // don't update while tab is backgrounded
            const dt            = (now - then) / 1000;
            then                = now;
            const wasCoolingDown = cooldown > 0;
            cooldown            -= dt;

            if (cooldown <= 0) {
                if (wasCoolingDown) {
                    // advance to next word pair
                    textIndex           = (textIndex + 1) % words.length;
                    text1.textContent   = words[textIndex % words.length];
                    text2.textContent   = words[(textIndex + 1) % words.length];
                }
                // run morph
                morph    -= cooldown;   // cooldown is negative = elapsed overshoot
                cooldown  = 0;
                let frac  = morph / MORPH_TIME;
                if (frac > 1) {
                    cooldown = COOLDOWN_TIME;
                    frac     = 1;
                }
                applyMorph(frac);
            } else {
                holdWord();
            }
        }

        // Pause the loop when tab is hidden — no GPU spend while invisible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) then = performance.now(); // reset delta on resume
        });

        requestAnimationFrame(tick);
    }


    /* ── PUBLIC ──────────────────────────────────────────────────────────────── */
    window.ARK = {
        get lenis() { return lenis; },
        refresh: () => ScrollTrigger.refresh(),
    };

}());
