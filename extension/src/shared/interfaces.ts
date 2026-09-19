// The registry every content script's widget dropdown is built from — kept
// in one place so adding a new interface later means adding one entry here
// (plus its own content script/manifest match), not touching every widget.
//
// Vendored from Ninebark-DesmosExtension (see VENDORED.md), with this repo's
// own `rstudio` entry added — the one edit each interface repo makes to its
// vendored copy of this file. The `matlab` entry is also carried here since
// Ninebark-MATLABExtension has shipped, so "open X to use it there" stays
// accurate.
import type { InterfaceInfo } from './widget'

export const INTERFACES: InterfaceInfo[] = [
  { id: 'desmos', label: 'Desmos' },
  { id: 'sheets', label: 'Google Sheets' },
  { id: 'excel', label: 'Microsoft Excel' },
  { id: 'matlab', label: 'MATLAB Online' },
  { id: 'overleaf', label: 'Overleaf' },
  { id: 'rstudio', label: 'RStudio' },
]
