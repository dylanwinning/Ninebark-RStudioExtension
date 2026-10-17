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
  { title: 'Import & inspect data', examples: [
    'load data.csv into R', 'import data.xlsx from the second worksheet',
    'load data.rds into my environment', 'show me the first 10 rows of df',
    'the column names of df', 'the dimensions of df', 'the data types of every column of df',
    'count the missing values in each column of df',
  ] },
  { title: 'Clean & filter data', examples: [
    'remove rows with missing values in income', 'remove duplicate rows from the dataset',
    'keep only observations where age is greater than 18', 'keep only the columns age, income, and education',
    'sort the dataset by income from highest to lowest', 'rename educ to education',
    'convert gender into a categorical variable', 'replace missing values in income with the median income',
  ] },
  { title: 'Create & transform variables', examples: [
    'create a column called total_score by adding math_score and reading_score',
    'create a binary variable called passed that is 1 when score is at least 60 and 0 otherwise',
    'recode M to Male and F to Female in gender',
    'divide age into groups: under 18, 18-29, 30-49, and 50 or older',
    'standardize income', 'create a natural-log transformation of income',
    'calculate the number of days between start_date and end_date',
    'merge the datasets students and grades using student_id',
    'rank participants by score within each treatment group',
  ] },
  { title: 'Vectors & data frames', examples: [
    'let x be a vector of 1,2,3,4,5', 'a data frame with columns name and age',
  ] },
  { title: 'Plotting', examples: [
    'scatter plot of x and y', 'histogram of x', 'boxplot of x by group',
    "add a title 'Results'", "label the x axis 'time (s)'", 'a ggplot of x and y from df',
    'plot a normal distribution with mean 0 and sd 1',
    'plot the cdf of a binomial distribution with 10 trials and probability 0.3',
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
    // Resolution — pure logic, always works. "recognized" here means
    // THIS step succeeded, not whether dispatch (below) also succeeds —
    // an RPC/console-reachability problem isn't an NL coverage gap, so
    // it's logged separately, not as "not recognized".
    let command: ReturnType<typeof resolveToRCommand>
    try {
      command = resolveToRCommand(rawInput)
    } catch (err) {
      const message = err instanceof RNlFailure || err instanceof Error ? err.message : String(err)
      ui.logEntry(rawInput, message, false)
      ui.input.select()
      logRawInput(rawInput, 'rstudio', false)
      return
    }
    logRawInput(rawInput, 'rstudio', true)

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
