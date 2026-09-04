// Selective Bootstrap JS bundle — only Tab is imported, since it's the
// only Bootstrap JS component used anywhere across the 3 pages
// (quotes-admin's data-bs-toggle="tab" markup). No modal, dropdown,
// tooltip, popover, carousel, collapse, offcanvas, toast, or scrollspy is
// used, so none of those (or Popper, needed only by tooltip/popover/
// dropdown) are pulled in here.
//
// Bootstrap's own data-API listener (bundled inside tab.js itself) wires
// up the data-bs-toggle="tab" click handling automatically — nothing here
// needs to call Tab's API directly, but the global is still exposed for
// consistency with how the full bootstrap.bundle.min.js used to work, in
// case a future page needs to trigger a tab switch programmatically.
//
// To add another component (e.g. a future page needs a modal): add
// `import Modal from 'bootstrap/js/dist/modal';` below and add it to the
// exported global — esbuild pulls in exactly that component's own
// dependency chain, nothing more.
import Tab from 'bootstrap/js/dist/tab';

window.bootstrap = { Tab };
