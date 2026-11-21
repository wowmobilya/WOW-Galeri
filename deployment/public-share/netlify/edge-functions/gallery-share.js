import {createPublicShareFrontend} from '../../../../modules/gallery/public-share-render.mjs';

// Configure build.edge_functions to this directory. Keep the relative import
// and deploy with the matching Functions-scoped configuration.
export default request=>createPublicShareFrontend({
 apiOrigin:Netlify.env.get('WOW_PUBLIC_SHARE_API_ORIGIN'),
 siteOrigin:Netlify.env.get('WOW_PUBLIC_SHARE_SITE_ORIGIN')
})(request);
export const config={path:'/share/*',onError:'fail'};
