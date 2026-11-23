/// <reference lib="esnext" />
// What each screen shows, for the ❓ panel (owner 2026-11-22: "a guide on each and every page"). Short lines, one
// thing each; keep them in step with the screens
import { t } from '../../app/i18n';
import type { Screen } from './App';

// a function, not a constant: the texts are read in the language of the moment
export const help = (screen: Screen): { about: string; items: Array<[string, string]> } => helpAll()[screen];

const helpAll = (): Record<Screen, { about: string; items: Array<[string, string]> }> => ({
  Chart: {
    about: t('How your account grew: your fund picks on their own, your money in dollars, and both against an index'),
    items: [
      [t('Performance'), t('Your own return: 100 on the first day with money, contributions taken out. 140 = your fund picks made +40%')],
      [t('Value $'), t('The account in dollars, contributions included. The cyan line "All in SPY": the same contributions on the same days, all bought into the index you compare with; the line under the buttons says the difference today')],
      [t('vs SPY %'), t('One bar per candle: your return minus the index over the same days. Green: your picks did better, red: the index did. The table lists every period; the line above it counts the wins')],
      [t('SPY ▾'), t('The index your picks are compared with in "vs", in the "All in" line and in the funds table')],
      [t('1D 1W 1M 1Q 1Y'), t('How long one candle (or bar) is')],
      [t('1M ... All, log'), t('The shown range; log makes equal percentage moves look equal')],
      [t('Bars at the bottom'), t('Money that came in during the candle (paychecks)')],
      [t('Markers'), t('Blue "Roth N%": your requests to change the contribution percent. Red "⇄ N funds": money moved between funds')],
      [t('Benchmarks'), t('Lines of other ETFs (total return) from the first shown day, for a look side by side')],
      [t('Funds held'), t('Every fund you had, its own return while you held it and the index over the same days. Below 0: the index would have done better on those days')],
    ],
  },
  Builder: {
    about: t('Your own chart: several lines and panes on one time axis'),
    items: [
      [t('Portfolio, Value $'), t('Your performance line or the dollar value')],
      [t('Benchmarks'), t('Index lines started at your value on the first shown day')],
      [t('Contributions pane, Drawdown pane'), t('Extra panes under the chart: money in, and how far below its last high the account was')],
      [t('from'), t('The first day of the chart')],
    ],
  },
  Returns: {
    about: t('Numbers of your return, checked against what mykplan itself says'),
    items: [
      [t('TWR'), t('Time-weighted return: the fund picks only, contributions do not change it. All time and per year')],
      [t('XIRR'), t('Money-weighted return: counts when your money came in, like a bank rate for your own cash')],
      [t('Max drawdown'), t('The deepest fall from a high, and when')],
      [t('Months table'), t('Our monthly TWR against the site\'s Personal RoR; ⚠ marks a difference above 0.05 points')],
    ],
  },
  Transactions: {
    about: t('Every transaction mykplan shows, one row each'),
    items: [
      [t('Activity date, Pay check'), t('The day the money bought the fund, and the paycheck it came from')],
      [t('Type, Source'), t('Contribution, dividend, transfer; Roth, before-tax, match or NEC')],
      [t('Filter'), t('words = AND, a,b = OR, !x = NOT, =x exact, ^x starts with; CSV and JSON export what is shown')],
    ],
  },
  Statements: {
    about: t('The quarterly statements and the site\'s 12-month summaries'),
    items: [
      [t('Saved documents'), t('Statement PDFs and Quicken files the script saved (also in 📦 Raw on the mykplan panel)')],
      [t('12-month windows'), t('Begin, contributions, dividends, market change and end of each year window, with the site\'s rate of return')],
    ],
  },
  Contributions: {
    about: t('What went in, from whom, and what it is worth before and after tax'),
    items: [
      [t('Cards'), t('Totals by source; Non-Roth = before-tax + match + NEC, taxed when withdrawn')],
      [t('Contribution percent'), t('Your Roth and pre-tax percents after each change request')],
      [t('Pay check, Activity date, Delay'), t('When you were paid, when the money bought the funds, and the days between')],
      [t('Total invested'), t('Everything put in up to that paycheck')],
      [t('P&L $ at, P&L % at'), t('Value at minus Total invested, in dollars and percent')],
      [t('Value at'), t('The account value on the activity day')],
      [t('After 12% + NJ ...'), t('Value at if withdrawn: the Roth part in full, the rest with its growth minus federal + New Jersey tax. Hover the header for the brackets')],
      [t('Balances by source'), t('Month-end balance of each source')],
    ],
  },
  Insights: {
    about: t('What your decisions did'),
    items: [
      [t('Buy the dip'), t('Contributions made while the account was below its high, and how they did')],
      [t('Rebalances'), t('Every move between funds: what was sold, what was bought')],
    ],
  },
  Forecast: {
    about: t('Where the account can be at retirement'),
    items: [
      [t('Retire at, Return, Volatility, Inflation'), t('Your inputs; the return starts at your own history')],
      [t('Monte Carlo P10 / P50 / P90'), t('5,000 random paths: a bad (P10), a middle (P50) and a good (P90) outcome')],
      [t('You put in / employer, Growth'), t('How the final value splits')],
      [t('Goals, By year'), t('When the goals are reached and the value year by year')],
    ],
  },
});
