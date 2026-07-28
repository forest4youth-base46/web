(function() {
  var inIframe = window.self !== window.top;

  if (inIframe) {
    // Tells the parent page the current document height so an
    // auto-sizing iframe embed doesn't need a fixed height.
    function sendHeight() {
      var h = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'resize', height: h }, '*');
    }
    // Send on load and on every DOM mutation that changes height
    window.addEventListener('load', sendHeight);
    var ro = new ResizeObserver(sendHeight);
    ro.observe(document.body);
  }

  // Scrolls to the top of the current view after navigating to a
  // focused module. Standalone, this just scrolls the window. Embedded,
  // the iframe document is usually auto-height with no scrollbar of its
  // own, so scrolling it does nothing — ask the host page to scroll the
  // iframe element into view instead. See README for the listener the
  // host page needs to add to act on this message.
  window.scrollToViewTop = function() {
    if (inIframe) {
      window.parent.postMessage({ type: 'scrollToTop' }, '*');
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }
  };
})();
