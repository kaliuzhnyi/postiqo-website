export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = 'postiqo.io';
    return Response.redirect(url.href, 301);
  }
};
