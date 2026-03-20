const DASHBOARD_URL = 'https://dashboard.foundlystart.co.uk';
const EMAIL = 'hello@foundlystart.co.uk';

const heroWords = ['We', 'grow', 'your', 'pipeline.'];

const services = [
  {
    number: '01',
    name: 'LEAD DISCOVERY',
    description: 'Newly incorporated UK businesses from Companies House, scored and filtered',
  },
  {
    number: '02',
    name: 'CONTACT ENRICHMENT',
    description: 'Verified emails, phone numbers, decision-maker identification',
  },
  {
    number: '03',
    name: 'OUTREACH SETUP',
    description: 'Personalised sequences, sender warmup, deliverability tuned',
  },
  {
    number: '04',
    name: 'GUIDED SUPPORT',
    description: 'We work alongside you until the pipeline runs itself',
  },
];

const steps = [
  {
    number: '01',
    title: 'DISCOVERY CALL',
    description: 'We learn your target market, existing setup, and goals. No generic templates.',
  },
  {
    number: '02',
    title: 'BUILD & CONFIGURE',
    description: 'We set up your lead pipeline, outreach sequences, and tracking - end to end.',
  },
  {
    number: '03',
    title: 'RUN & OPTIMISE',
    description: 'You get results. We monitor, tune, and iterate with you every week.',
  },
];

export default function WelcomePage() {
  return (
    <div className="welcomePage">
      <style>
        {`
          .welcomePage {
            --bg: #050505;
            --text: rgba(255, 255, 255, 0.95);
            --muted: rgba(255, 255, 255, 0.45);
            --line: rgba(255, 255, 255, 0.08);
            --softLine: rgba(255, 255, 255, 0.06);
            --accent: #C8F135;
            min-height: 100vh;
            background: var(--bg);
            color: var(--text);
            font-family: 'Space Mono', monospace;
            position: relative;
          }

          .welcomePage::before {
            content: '';
            position: fixed;
            inset: 0;
            pointer-events: none;
            opacity: 0.035;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 140 140' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
            z-index: 1;
          }

          .welcomeNav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem clamp(1.25rem, 4vw, 4rem);
            background: transparent;
          }

          .brand {
            margin: 0;
            color: #fff;
            letter-spacing: 0.25em;
            font-size: 0.75rem;
            font-weight: 700;
          }

          .dashboardLink {
            color: rgba(255, 255, 255, 0.35);
            text-decoration: none;
            font-size: 0.8rem;
            transition: color 150ms ease;
          }

          .dashboardLink:hover,
          .dashboardLink:focus-visible {
            color: var(--accent);
            outline: none;
          }

          .welcomeMain {
            position: relative;
            z-index: 2;
            padding: 0 clamp(1.25rem, 5vw, 6rem) 5rem;
          }

          .section {
            padding: clamp(4rem, 10vw, 8rem) 0;
          }

          .hero {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding-top: 6rem;
          }

          .heroHeading {
            margin: 0;
            max-width: 12ch;
            font-family: 'Playfair Display', serif;
            font-style: italic;
            font-weight: 700;
            line-height: 0.96;
            font-size: clamp(3.5rem, 8vw, 6.875rem);
            letter-spacing: -0.01em;
          }

          .heroWord {
            display: inline-block;
            overflow: hidden;
            margin-right: 0.18em;
          }

          .heroWord > span {
            display: inline-block;
            transform: translateY(40px);
            opacity: 0;
          }

          @media (prefers-reduced-motion: no-preference) {
            .heroWord > span {
              animation: wordIn 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .heroWord:nth-child(1) > span { animation-delay: 0ms; }
            .heroWord:nth-child(2) > span { animation-delay: 80ms; }
            .heroWord:nth-child(3) > span { animation-delay: 160ms; }
            .heroWord:nth-child(4) > span { animation-delay: 240ms; }
          }

          @keyframes wordIn {
            from {
              opacity: 0;
              transform: translateY(40px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .accent {
            color: var(--accent);
          }

          .heroSubline {
            margin: 2rem 0 3rem;
            color: var(--muted);
            font-size: clamp(0.75rem, 1.8vw, 0.9rem);
            line-height: 1.6;
          }

          .heroRule {
            margin: 0;
            border: 0;
            border-top: 1px solid var(--line);
          }

          .sectionMarker {
            margin: 0 0 1rem;
            color: var(--accent);
            font-size: 0.7rem;
            letter-spacing: 0.14em;
          }

          .sectionTitle {
            margin: 0;
            max-width: 700px;
            font-family: 'Playfair Display', serif;
            font-style: italic;
            font-size: clamp(2.1rem, 4.8vw, 3rem);
            line-height: 1.13;
            letter-spacing: -0.01em;
          }

          .servicesList {
            margin-top: clamp(2.2rem, 6vw, 3.5rem);
          }

          .serviceItem {
            border-bottom: 1px solid var(--softLine);
            padding: 1.3rem 0;
            display: grid;
            grid-template-columns: minmax(3rem, 4.5rem) 1fr;
            gap: 1.2rem;
            transition: color 150ms ease;
          }

          .serviceNumber {
            color: rgba(255, 255, 255, 0.35);
            font-size: 1.35rem;
            line-height: 1;
            transition: color 150ms ease;
          }

          .serviceItem:hover .serviceNumber {
            color: var(--accent);
          }

          .serviceName {
            margin: 0;
            color: #fff;
            font-size: 1rem;
            letter-spacing: 0.1em;
          }

          .serviceDescription {
            margin: 0.55rem 0 0;
            color: var(--muted);
            font-size: 0.8rem;
            line-height: 1.7;
          }

          .productLayout {
            display: grid;
            grid-template-columns: 3fr 2fr;
            gap: clamp(2rem, 7vw, 6rem);
            align-items: start;
            margin-top: 2rem;
          }

          .quote {
            margin: 0;
            max-width: 18ch;
            font-family: 'Playfair Display', serif;
            font-style: italic;
            font-size: clamp(2rem, 4vw, 3.5rem);
            line-height: 1.15;
          }

          .bodyCopy {
            color: var(--muted);
            font-size: 0.85rem;
            line-height: 1.9;
          }

          .bodyCopy p {
            margin: 0;
          }

          .bodyCopy p + p {
            margin-top: 1.25rem;
          }

          .stepsTitle {
            margin: 0 0 2.2rem;
            font-family: 'Playfair Display', serif;
            font-style: italic;
            font-size: clamp(1.9rem, 4.2vw, 2.5rem);
          }

          .stepsGrid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: clamp(1.25rem, 4vw, 3rem);
          }

          .stepCard {
            position: relative;
            border-top: 2px solid var(--line);
            padding-top: 1.5rem;
          }

          .stepCardPrimary {
            border-top-color: var(--accent);
          }

          .stepGhostNumber {
            position: absolute;
            top: 0.2rem;
            left: 0;
            font-size: 4rem;
            line-height: 1;
            color: var(--accent);
            opacity: 0.15;
            pointer-events: none;
          }

          .stepTitle {
            margin: 1.8rem 0 0.65rem;
            font-size: 0.9rem;
            color: #fff;
            letter-spacing: 0.15em;
          }

          .stepDescription {
            margin: 0;
            color: var(--muted);
            font-size: 0.8rem;
            line-height: 1.8;
            max-width: 34ch;
          }

          .contactTitle {
            margin: 0;
            font-family: 'Playfair Display', serif;
            font-style: italic;
            font-size: clamp(3rem, 10vw, 4.5rem);
            line-height: 1;
          }

          .contactSubline {
            margin: 1rem 0 1.8rem;
            color: var(--muted);
            font-size: 0.82rem;
          }

          .emailLink {
            color: var(--accent);
            text-decoration: none;
            font-size: clamp(1rem, 2.2vw, 1.1rem);
          }

          .emailLink:hover,
          .emailLink:focus-visible,
          .contactAction:hover,
          .contactAction:focus-visible {
            text-decoration: underline;
            text-underline-offset: 0.2rem;
            outline: none;
          }

          .contactAction {
            display: inline-block;
            margin-top: 1rem;
            color: #fff;
            text-decoration: none;
            font-size: 0.85rem;
          }

          .copyright {
            margin-top: 5rem;
            color: rgba(255, 255, 255, 0.35);
            font-size: 0.68rem;
          }

          @media (max-width: 767px) {
            .productLayout,
            .stepsGrid {
              grid-template-columns: 1fr;
            }

            .hero {
              justify-content: center;
              padding-top: 4.5rem;
            }

            .welcomeMain {
              padding-left: 1.25rem;
              padding-right: 1.25rem;
            }
          }
        `}
      </style>

      <nav className="welcomeNav" aria-label="Primary">
        <p className="brand">FOUNDLY START</p>
        <a className="dashboardLink" href={DASHBOARD_URL}>
          Go to dashboard →
        </a>
      </nav>

      <main className="welcomeMain">
        <section className="section hero" aria-label="Hero">
          <h1 className="heroHeading">
            {heroWords.map((word) => {
              const isPipelineWord = word.toLowerCase() === 'pipeline.';
              return (
                <span key={word} className="heroWord">
                  <span className={isPipelineWord ? 'accent' : undefined}>
                    {word}
                  </span>
                </span>
              );
            })}
          </h1>
          <p className="heroSubline">B2B lead generation + outreach - built and run with you.</p>
          <hr className="heroRule" />
        </section>

        <section className="section" aria-label="What we do">
          <p className="sectionMarker">/ 01</p>
          <h2 className="sectionTitle">We find the businesses that need you. Then we help you reach them.</h2>
          <div className="servicesList">
            {services.map((service) => (
              <article className="serviceItem" key={service.number}>
                <p className="serviceNumber">{service.number}</p>
                <div>
                  <h3 className="serviceName">{service.name}</h3>
                  <p className="serviceDescription">{service.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section" aria-label="The product is us">
          <p className="sectionMarker">/ 02</p>
          <div className="productLayout">
            <blockquote className="quote">"Most tools hand you a dashboard and disappear. We stay until it works."</blockquote>
            <div className="bodyCopy">
              <p>
                Foundly Start is not software you subscribe to. It is a service built around your business - we configure
                the systems, run the outreach flows, and tune them based on what converts for you.
              </p>
              <p>You keep full control and visibility. We bring the infrastructure and the expertise.</p>
            </div>
          </div>
        </section>

        <section className="section" aria-label="How it works">
          <p className="sectionMarker">/ 03</p>
          <h2 className="stepsTitle">Simple to start. Serious results.</h2>
          <div className="stepsGrid">
            {steps.map((step, index) => (
              <article className={`stepCard ${index === 0 ? 'stepCardPrimary' : ''}`} key={step.number}>
                <p className="stepGhostNumber" aria-hidden="true">
                  {step.number}
                </p>
                <h3 className="stepTitle">{step.title}</h3>
                <p className="stepDescription">{step.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="welcomeMain section" aria-label="Contact">
        <p className="sectionMarker">/ 04</p>
        <h2 className="contactTitle">Let&apos;s talk.</h2>
        <p className="contactSubline">No forms. No decks. Just a conversation.</p>
        <a className="emailLink" href={`mailto:${EMAIL}`}>
          {EMAIL}
        </a>
        <br />
        <a className="contactAction" href={`mailto:${EMAIL}`}>
          → Send us a message
        </a>
        <p className="copyright">© 2025 Foundly Start</p>
      </footer>
    </div>
  );
}

