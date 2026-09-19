// ── Ninebark for RStudio — content script ───────────────────────────────
// Runs on Posit Cloud / RStudio Server / Posit Workbench tabs (isolated
// world — see EXECUTION.md §4). Resolution (English → an R command bound
// for either the Console or the Source editor) is pure and always works;
// dispatch (EXECUTION.md §2–§3, via ../../src/rExecClient.ts) fails loud
// with a specific message when it can't reach the session, and always
// surfaces the resolved R so it can be pasted by hand.
import { resolveToRCommand, RNlFailure } from '../../src/resolveRPhrase'
import { dispatchRCommand } from '../../src/rExecClient'
import { logRawInput } from '../../src/vendor/ninebark-engine/inputLogger'
import { buildOverlay, type ExampleGroup } from './shared/widget'
import { INTERFACES } from './shared/interfaces'
import logoDataUri from '../../public/favicon.png'

const EXAMPLE_GROUPS: ExampleGroup[] = [
  { title: 'Statistics', examples: [
    'mean of 1,2,3,4,5', 'standard deviation of 2,4,4,4,5,5,7,9',
    'median of 1,3,3,6,7,8,9', 'correlation between 1,2,3 and 2,4,6',
    'cdf of a normal distribution with mean 0 and sd 1 at 1.96',
    'linear regression of 1,2,3 and 2,4,6',
  ] },
  { title: 'Vectors & data frames', examples: [
    'let x be a vector of 1,2,3,4,5', 'read the csv file data.csv into df',
    'the first 5 rows of df', 'summary of df', 'filter df where age is greater than 30',
    'select the columns name and age from df', 'sort df by age descending',
  ] },
  { title: 'Plotting', examples: [
    'scatter plot of x and y', 'histogram of x', 'boxplot of x by group',
    "add a title 'Results'", "label the x axis 'time (s)'", 'a ggplot of x and y from df',
  ] },
  { title: 'Control flow', examples: [
    'for i in 1 to 10 print i', 'if x is greater than 5 print big else print small',
    'while x is less than 10 print x and increment x',
  ] },
  { title: 'Workspace & packages', examples: [
    'let x be 5', 'clear the workspace', 'install the package ggplot2', 'load the package dplyr',
    'list the variables', 'save the workspace to session.RData',
  ] },
  { title: 'Calculus & linear algebra', examples: [
    'differentiate x^2 with respect to x', 'integral of x^2 from 0 to 1',
    'the determinant of A', 'the inverse of A', 'multiply A by B', 'the eigenvalues of A',
  ] },
  { title: 'Any R', examples: [
    'x <- c(1, 2, 3)', 'summary(mtcars)', 'plot(x, y)', 'in the script for (i in 1:10) print(i)',
  ] },
]

function mountWidget(): void {
  const ui = buildOverlay({
    currentInterface: INTERFACES.find(i => i.id === 'rstudio')!,
    allInterfaces: INTERFACES,
    exampleGroups: EXAMPLE_GROUPS,
    logoDataUri,
    widgetKeyPrefix: 'ninebark-widget-rstudio',
  })

  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const rawInput = ui.input.value.trim()
    if (!rawInput) return
    logRawInput(rawInput)

    // Resolution — pure logic, always works.
    let command: ReturnType<typeof resolveToRCommand>
    try {
      command = resolveToRCommand(rawInput)
    } catch (err) {
      const message = err instanceof RNlFailure || err instanceof Error ? err.message : String(err)
      ui.logEntry(rawInput, message, false)
      ui.input.select()
      return
    }

    // Dispatch — Console (RPC, real output) or Source (Ace insert), with a
    // DOM-insert fallback for the Console on any RPC failure. See
    // ../../EXECUTION.md §2-§3.
    try {
      const result = await dispatchRCommand(command.target, command.code)
      if (result.ok) {
        const label = command.target === 'source' ? 'Inserted' : (result.output.trim() || `Ran  ${command.code}`)
        ui.logEntry(rawInput, label, true, command.code)
      } else {
        ui.logEntry(rawInput, `${result.error}  ·  resolved: ${command.code}`, false, command.code)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ui.logEntry(rawInput, `${message}  ·  resolved: ${command.code}`, false, command.code)
    }
    ui.input.value = ''
  })
}

if (window.top === window) mountWidget()
