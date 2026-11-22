import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AccountFrame } from './AccountPages';
import { useIsDesktop } from './useIsDesktop';

const Ui = ({ children }: { children: ReactNode }) => <span className="help-ui">{children}</span>;
const Glyph = () => <span className="glyph glyph-sm" role="img" aria-label="the person button" />;

type Rows = [string, ReactNode][];

function Section({ title, rows, children }: { title: string; rows?: Rows; children?: ReactNode }) {
  return (
    <section className="help-section">
      <div className="col-head">
        <span className="col-mark">##</span>
        <span className="help-title">{title}</span>
      </div>
      {rows?.map(([k, v]) => (
        <div className="help-row" key={k}>
          <span className="help-key">{k}</span>
          <span className="help-text">{v}</span>
        </div>
      ))}
      {children}
    </section>
  );
}

const desktopCopy: Record<string, Rows> = {
  terms: [
    ['add', <>click <Ui>+new</Ui> (top right), type a name</>],
    ['switch', 'click its name'],
    ['rename', <>click <Ui>[fall 26]</Ui> and type</>],
    ['delete', 'hover it, click ×, then yes'],
  ],
  classes: [
    ['add', 'hover the columns, click + class at the end'],
    ['rename', 'click the class name and type'],
    ['delete', 'hover the header (the count turns into ×). click, then yes'],
  ],
  assignments: [
    ['add', '+ add under a class. name, date, time if it matters (blank = 11:59pm). enter'],
    ['status', 'click the chip, pick one'],
    ['edit', 'hover the row, click edit, change anything, save'],
    ['delete', 'edit → delete → yes'],
  ],
};

const mobileCopy: Record<string, Rows> = {
  terms: [
    ['add', <>tap <Ui>+new</Ui>, type a name</>],
    ['switch', 'tap its name'],
    ['rename', <>tap <Ui>[fall 26]</Ui> and type</>],
    ['delete', 'press and hold it, then yes'],
  ],
  classes: [
    ['move', 'swipe left / right, or tap a tab'],
    ['add', 'tap + class at the end of the tabs'],
    ['rename', 'tap the big class name and type'],
    ['delete', 'press and hold its tab, then yes'],
  ],
  assignments: [
    ['add', '+ add at the bottom of a class. name, date, time if it matters. add'],
    ['status', 'tap the chip, pick one'],
    ['edit', 'tap the row (anywhere but the chip), change, save'],
    ['delete', 'edit → delete → yes'],
  ],
};

const littleThings = (verb: string): Rows => [
  ['due soon', 'dates go dark when something is due within 2 days, or late'],
  ['finished', <><Ui>▸ finished (N)</Ui> opens what's done. closed again next visit</>],
  ['phrase', <>the <Ui>#</Ui> line under the name belongs to the term. {verb} to rewrite it</>],
  ['order', 'sorted by due date, soonest first'],
  ['saving', 'everything saves as you type'],
];

const account: Rows = [
  ['password', <><Glyph /> → account settings → reset password</>],
  ['username', <><Glyph /> → account settings</>],
  ['log out', <><Glyph /> → log out</>],
];

const statuses: [string, string, string][] = [
  ['planned', 'planned', 'on the list, not started'],
  ['working', 'working..', 'started, not finished'],
  ['done', 'done!', 'finished, folds into ▸ finished'],
  ['exam', 'EXAM!!', 'an exam is coming'],
  ['examok', 'EXAM:)', 'exam taken, folds into ▸ finished'],
];

/* printed hex is the sRGB equivalent; the square renders the real token so it always matches */
const swatches: [string, string, string][] = [
  ['#efede8', 'background', 'var(--bg)'],
  ['#1f1e1c', 'ink', 'var(--ink)'],
  ['#8d8a84', 'muted', 'var(--muted)'],
  ['#9a978f', 'muted, lighter', 'var(--muted-2)'],
  ['#dfdcd5', 'lines', 'var(--line)'],
  ['#f6f4f0', 'menus, inputs', 'var(--surface)'],
  ['#6a6762', 'planned', '#6a6762'],
  ['#f4dfb4', 'working.. fill', 'oklch(0.91 0.06 85)'],
  ['#7b4800', 'working.. text', 'oklch(0.45 0.11 70)'],
  ['#cdead2', 'done! fill', 'oklch(0.91 0.045 150)'],
  ['#0b5d2a', 'done! text', 'oklch(0.42 0.11 150)'],
  ['#fed2cd', 'EXAM!! fill', 'oklch(0.90 0.05 25)'],
  ['#b71824', 'EXAM!! text', 'oklch(0.50 0.19 25)'],
  ['#dedff8', 'EXAM:) fill', 'oklch(0.91 0.035 285)'],
  ['#534a9c', 'EXAM:) text', 'oklch(0.46 0.13 285)'],
];

export function HelpPage() {
  const isDesktop = useIsDesktop();
  const [desktop, setDesktop] = useState(isDesktop);
  const copy = desktop ? desktopCopy : mobileCopy;

  return (
    <AccountFrame glyph>
      <div className="acct-content help">
        <div className="help-top">
          <Link to="/" className="back-link">{isDesktop ? '← back to list' : '← back'}</Link>
          <div className="help-switch">
            {([['desktop', true], ['mobile', false]] as const).map(([label, d]) =>
              d === desktop
                ? <span key={label} className="help-switch-current">[{label}]</span>
                : <button key={label} className="help-switch-other" onClick={() => setDesktop(d)}>{label}</button>,
            )}
          </div>
        </div>
        <div className="help-grid">
          <Section title="terms" rows={copy.terms} />
          <Section title="classes" rows={copy.classes} />
          <Section title="assignments" rows={copy.assignments} />
          <Section title="statuses">
            {statuses.map(([cls, label, meaning]) => (
              <div className="help-status" key={label}>
                <span className="help-chip-slot"><span className={`chip st-${cls}`}>{label}</span></span>
                <span className="help-text">{meaning}</span>
              </div>
            ))}
            <p className="help-foot">
              assignments use the top three, exams the bottom two. pick <Ui>assignment</Ui> or <Ui>exam</Ui> when adding or editing.
            </p>
          </Section>
          <Section title="little things" rows={littleThings(desktop ? 'click' : 'tap')} />
          <Section title="account" rows={account} />
        </div>
        <div className="help-nerds">
          <Section title="for nerds">
            <div className="help-swatches">
              {swatches.map(([hex, label, value]) => (
                <div className="help-swatch" key={hex}>
                  <span className="help-square" style={{ background: value }} />
                  <span className="help-hex">- {hex}</span>
                  <span className="help-swatch-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="help-fonts">
              <span className="help-font-serif">Instrument Serif italic</span>
              <span className="help-font-sans">Geist</span>
              <span className="help-font-mono">Geist Mono</span>
            </div>
          </Section>
        </div>
      </div>
    </AccountFrame>
  );
}
