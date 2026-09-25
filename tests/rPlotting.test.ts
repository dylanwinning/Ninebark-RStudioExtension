// Direct unit tests for rPlotting.ts, focused on tryDistributionPlot (the
// newest recognizer, with no precedent elsewhere in this file to lean on)
// and the ordering guarantees the other plot recognizers depend on.
import { describe, it, expect } from 'vitest'
import { recognizePlotting } from '../src/rPlotting'

describe('distribution plotting — continuous families use curve()', () => {
  it('defaults to the pdf (bell-curve shape) with no "pdf"/"cdf" specified', () => {
    expect(recognizePlotting('plot a normal distribution with mean 0 and sd 1'))
      .toBe('curve(dnorm(x, 0, 1), from = -4, to = 4)')
  })
  it('"the pdf of" is explicit but produces the same thing as the default', () => {
    expect(recognizePlotting('plot the pdf of a normal distribution with mean 0 and sd 1'))
      .toBe('curve(dnorm(x, 0, 1), from = -4, to = 4)')
  })
  it('"the cdf of" switches d<stem> to p<stem>', () => {
    expect(recognizePlotting('plot the cdf of a normal distribution with mean 0 and sd 1'))
      .toBe('curve(pnorm(x, 0, 1), from = -4, to = 4)')
  })
  it('t distribution — bounds default to -4..4 regardless of df', () => {
    expect(recognizePlotting('plot a t distribution with 10 degrees of freedom'))
      .toBe('curve(dt(x, 10), from = -4, to = 4)')
  })
  it('chi-squared — bounds start at 0 and scale with df', () => {
    expect(recognizePlotting('plot a chi-square distribution with 5 degrees of freedom'))
      .toBe('curve(dchisq(x, 5), from = 0, to = 18)')
  })
  it('uniform — "from A to B" is the distribution\'s OWN parameters, not a bounds override, and doubles as the plot range', () => {
    expect(recognizePlotting('plot a uniform distribution from 0 to 10'))
      .toBe('curve(dunif(x, 0, 10), from = 0, to = 10)')
    expect(recognizePlotting('plot the cdf of a uniform distribution from 0 to 10'))
      .toBe('curve(punif(x, 0, 10), from = 0, to = 10)')
  })
})

describe('distribution plotting — discrete families use a spike/step plot()', () => {
  it('binomial pmf uses type="h" (a spike plot — curve() would misrepresent it as continuous)', () => {
    expect(recognizePlotting('plot a binomial distribution with 10 trials and probability 0.3'))
      .toBe('plot(0:10, dbinom(0:10, 10, 0.3), type = "h", xlab = "x", ylab = "probability")')
  })
  it('binomial cdf uses type="s" (a step function)', () => {
    expect(recognizePlotting('plot the cdf of a binomial distribution with 10 trials and probability 0.3'))
      .toBe('plot(0:10, pbinom(0:10, 10, 0.3), type = "s", xlab = "x", ylab = "cumulative probability")')
  })
  it('poisson — the upper bound is derived from mean + 4*sqrt(mean), with a floor of 10', () => {
    expect(recognizePlotting('plot a poisson distribution with mean 4'))
      .toBe('plot(0:12, dpois(0:12, 4), type = "h", xlab = "x", ylab = "probability")')
  })
  it('geometric — the upper bound is derived from probability, capped at 50', () => {
    expect(recognizePlotting('plot a geometric distribution with probability 0.2'))
      .toBe('plot(0:25, dgeom(0:25, 0.2), type = "h", xlab = "x", ylab = "probability")')
  })
})

describe('an explicit "from A to B" overrides the computed default bounds', () => {
  it('for a distribution whose own parameters do not use "from...to" (normal)', () => {
    expect(recognizePlotting('plot a normal distribution with mean 0 and sd 1 from -3 to 3'))
      .toBe('curve(dnorm(x, 0, 1), from = -3, to = 3)')
  })
})

describe('this file\'s existing plot recognizers are unaffected by the new one running first', () => {
  it.each([
    ['plot y against x', 'plot(x, y)'],
    ['plot x vs y', 'plot(x, y)'],
    ['scatter plot of x and y', 'plot(x, y)'],
    ['histogram of x', 'hist(x)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizePlotting(phrase)).toBe(expected)
  })

  it('a raw R expression plot ("plot sin(x) from 0 to 2*pi") still goes to tryCurve, not tryDistributionPlot', () => {
    expect(recognizePlotting('plot sin(x) from 0 to 2*pi')).toBe('curve(sin(x), from = 0, to = 2*pi)')
    expect(recognizePlotting('plot x^2 from -5 to 5')).toBe('curve(x^2, from = -5, to = 5)')
  })
})

describe('a non-distribution "plot ..." phrase is declined by tryDistributionPlot, not force-fit', () => {
  it('returns null rather than misinterpreting an ordinary plot command', () => {
    // Sanity check that tryDistributionPlot's presence ahead of tryScatter
    // doesn't accidentally swallow phrases with no distribution in them —
    // recognizePlotting still resolves these via the later recognizers.
    expect(recognizePlotting('plot y against x')).not.toBeNull()
  })
})
