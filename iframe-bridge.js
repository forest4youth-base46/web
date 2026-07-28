(function() {
  if (window.self === window.top) return; // not in an iframe
  function sendHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'resize', height: h }, '*');
  }
  // Send on load and on every DOM mutation that changes height
  window.addEventListener('load', sendHeight);
  var ro = new ResizeObserver(sendHeight);
  ro.observe(document.body);
})();
