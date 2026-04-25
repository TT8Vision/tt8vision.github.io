<?php
/**
 * IMADETHEARK Child Theme — functions.php
 *
 * Responsibilities:
 *  1. Enqueue parent theme stylesheet
 *  2. Enqueue child base stylesheet (style.css → Google Fonts)
 *  3. Enqueue design system (design.css)
 *  4. Register CDN libraries: Lenis, GSAP + ScrollTrigger
 *  5. Enqueue main.js (all motion, gestures, cursor, parallax)
 *  6. Inject WooCommerce hover image (secondary gallery thumbnail)
 *  7. Inject loading-screen guard into <head> (prevents FOUC)
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STYLES + SCRIPTS
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_enqueue_scripts', 'imadetheark_enqueue_assets', 20 );

function imadetheark_enqueue_assets() {

    $ver    = wp_get_theme()->get( 'Version' );
    $uri    = get_stylesheet_directory_uri();

    // ── Parent theme ──────────────────────────────────────────────────────────
    $parent_style = 'mixtas-style';
    wp_enqueue_style(
        $parent_style,
        get_template_directory_uri() . '/style.css',
        [],
        wp_get_theme( 'mixtas' )->get( 'Version' )
    );

    // ── Child base (style.css → fonts import) ─────────────────────────────────
    wp_enqueue_style(
        'imadetheark-base',
        get_stylesheet_uri(),
        [ $parent_style ],
        $ver
    );

    // ── Design system overrides ───────────────────────────────────────────────
    wp_enqueue_style(
        'imadetheark-design',
        $uri . '/assets/css/design.css',
        [ 'imadetheark-base' ],
        $ver
    );

    // ── CDN: Lenis smooth scroll ──────────────────────────────────────────────
    wp_enqueue_script(
        'ark-lenis',
        'https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.42/dist/lenis.min.js',
        [],
        '1.0.42',
        true
    );

    // ── CDN: GSAP core ────────────────────────────────────────────────────────
    wp_enqueue_script(
        'ark-gsap',
        'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
        [],
        '3.12.5',
        true
    );

    // ── CDN: GSAP ScrollTrigger ───────────────────────────────────────────────
    wp_enqueue_script(
        'ark-scrolltrigger',
        'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
        [ 'ark-gsap' ],
        '3.12.5',
        true
    );

    // ── CDN: GSAP SplitText (text character animations) ──────────────────────
    wp_enqueue_script(
        'ark-splittext',
        'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/SplitText.min.js',
        [ 'ark-gsap' ],
        '3.12.5',
        true
    );

    // ── Main motion + interaction script ─────────────────────────────────────
    wp_enqueue_script(
        'imadetheark-main',
        $uri . '/assets/js/main.js',
        [ 'ark-lenis', 'ark-gsap', 'ark-scrolltrigger', 'ark-splittext' ],
        $ver,
        true   // footer
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WOOCOMMERCE — HOVER IMAGE (second gallery image crossfade on card)
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'woocommerce_before_shop_loop_item_title', 'imadetheark_hover_image', 15 );

function imadetheark_hover_image() {
    global $product;

    if ( ! $product instanceof WC_Product ) {
        return;
    }

    $gallery_ids = $product->get_gallery_image_ids();

    if ( empty( $gallery_ids ) ) {
        return;
    }

    $hover_id  = (int) $gallery_ids[0];
    $hover_src = wp_get_attachment_image_url( $hover_id, 'woocommerce_thumbnail' );

    if ( ! $hover_src ) {
        return;
    }

    $alt = esc_attr( get_post_meta( $hover_id, '_wp_attachment_image_alt', true ) );
    if ( ! $alt ) {
        $alt = esc_attr( $product->get_name() );
    }

    echo '<img src="' . esc_url( $hover_src ) . '" alt="' . $alt . '" class="ark-img-hover" aria-hidden="true" loading="lazy">';
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOADING SCREEN GUARD — inline <head> script prevents FOUC
//    Sets ark-loading on <html> before any paint if first visit in session.
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_head', 'imadetheark_loading_screen_init', 1 );

function imadetheark_loading_screen_init() {
    ?>
    <script>
    (function () {
        if ( ! window.sessionStorage ) { return; }
        if ( ! sessionStorage.getItem( 'ark-loaded' ) ) {
            document.documentElement.classList.add( 'ark-loading' );
        }
    }());
    </script>
    <?php
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CUSTOM CURSOR MARKUP — injected after <body> opens
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_body_open', 'imadetheark_custom_cursor' );

function imadetheark_custom_cursor() {
    ?>
    <!-- ARK Custom Cursor -->
    <div class="ark-cursor" id="arkCursor" aria-hidden="true">
        <div class="ark-cursor__dot"></div>
        <div class="ark-cursor__ring"></div>
        <span class="ark-cursor__label"></span>
    </div>

    <!-- ARK Loading Screen -->
    <div class="ark-loader" id="arkLoader" aria-hidden="true">
        <div class="ark-loader__bg"></div>
        <div class="ark-loader__content">
            <div class="ark-loader__logo">
                <span class="ark-loader__word" data-word="I">I</span>
                <span class="ark-loader__word" data-word="MADE">MADE</span>
                <span class="ark-loader__word" data-word="THE">THE</span>
                <span class="ark-loader__word" data-word="ARK">ARK</span>
            </div>
            <div class="ark-loader__bar">
                <div class="ark-loader__bar-fill" id="arkLoaderBar"></div>
            </div>
            <div class="ark-loader__count" id="arkLoaderCount">0</div>
        </div>
    </div>

    <!-- Noise texture overlay -->
    <div class="ark-noise" aria-hidden="true"></div>
    <?php
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MARQUEE TICKER — injected before footer
// ─────────────────────────────────────────────────────────────────────────────

add_action( 'wp_footer', 'imadetheark_marquee_ticker', 5 );

function imadetheark_marquee_ticker() {
    $items = [
        'PREMIUM MANUFACTURING',
        'SOURCE & COMPLETE',
        'QUALITY CRAFTSMANSHIP',
        'GLOBAL SOURCING',
        'PRECISION MADE',
        'BUILT TO LAST',
    ];

    $repeated = array_merge( $items, $items ); // double for seamless loop
    ?>
    <div class="ark-marquee-section" aria-hidden="true">
        <div class="ark-marquee-track" id="arkMarquee">
            <?php foreach ( $repeated as $item ) : ?>
                <span class="ark-marquee-item">
                    <?php echo esc_html( $item ); ?>
                    <svg class="ark-marquee-sep" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="4" cy="4" r="3" fill="currentColor"/>
                    </svg>
                </span>
            <?php endforeach; ?>
        </div>
    </div>
    <?php
}
