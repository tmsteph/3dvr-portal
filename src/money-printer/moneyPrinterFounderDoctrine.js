export const MONEY_PRINTER_FOUNDER_DOCTRINE = Object.freeze([
  {
    source: 'Acquisition.com / Alex Hormozi offer strategy',
    principle: 'Pick a market with urgent pain, purchasing power, easy reach, and growth.',
    operatorRule: 'Reject vague audiences. Every offer must name one buyer segment, one painful problem, and why that buyer can pay now.'
  },
  {
    source: 'Acquisition.com / Alex Hormozi value equation',
    principle: 'Increase dream outcome and perceived likelihood; decrease time delay and effort.',
    operatorRule: 'Package the first offer around a concrete outcome, proof, speed, and done-for-you delivery before adding software.'
  },
  {
    source: 'Acquisition.com / Alex Hormozi offer creation',
    principle: 'Make the offer easier to say yes to with specific deliverables, bonuses, guarantees, urgency, and clear naming.',
    operatorRule: 'Every validation sprint needs a named package, deliverables, risk reversal, price test, and ethical urgency reason.'
  },
  {
    source: 'Y Combinator startup advice',
    principle: 'Build something people want by talking to users and watching what they already try to do.',
    operatorRule: 'Do not build from imagination. Create interview, reply, or paid-pilot tasks before implementation tasks.'
  },
  {
    source: 'Y Combinator / Paul Graham',
    principle: 'Do things that do not scale, especially manual user recruitment and concierge delivery.',
    operatorRule: 'Prefer manual audits, hand-built reports, and founder-led delivery until repeated pain and willingness to pay are proven.'
  },
  {
    source: 'Y Combinator startup advice',
    principle: 'Find the 90/10 solution and get 10-100 customers who love it.',
    operatorRule: 'Ship the smallest useful outcome that creates trust. Measure replies, calls, paid pilots, delivery quality, and referrals.'
  }
]);

export function formatMoneyPrinterFounderDoctrine() {
  return MONEY_PRINTER_FOUNDER_DOCTRINE
    .map((item, index) => [
      `${index + 1}. ${item.principle}`,
      `   Rule: ${item.operatorRule}`
    ].join('\n'))
    .join('\n');
}
