import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://cpc-bay-six.vercel.app/" },
    { url: "https://cpc-bay-six.vercel.app/privacy" },
  ];
}
