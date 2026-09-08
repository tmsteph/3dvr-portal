const approvalButton = document.querySelector('#bitwardenApproval');
const approvalDialog = document.querySelector('#approvalDialog');

approvalButton?.addEventListener('click', () => {
  if (typeof approvalDialog?.showModal === 'function') {
    approvalDialog.showModal();
  }
});
