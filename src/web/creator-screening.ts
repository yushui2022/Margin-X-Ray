import { SCREENING, screeningFor, brandLeadsFor } from "../shared/creator-screening";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function link(text: string, url: string): HTMLAnchorElement {
  const item = node("a", "", `${text} ↗`);
  item.href = url;
  item.target = "_blank";
  item.rel = "noopener noreferrer";
  return item;
}

export function renderScreening(handle: string): HTMLElement {
  const wrapper = node("section", "card creator-screening");
  const record = screeningFor(handle);
  if (!record) {
    wrapper.append(node("h2", "", "Public post research"), node("p", "", "No public sample has been collected for this account."));
    return wrapper;
  }
  wrapper.append(node("p", "eyebrow", `Initial research · ${record.observedAt}`), node("h2", "", "Public post research"));
  const sampled = record.status === "sampled";
  wrapper.append(node("p", "", sampled
    ? `${record.posts.length} public post captions collected from TikTok's creator embed. This is a limited platform-selected sample; it does not cover the account's full promotion history.`
    : "A public sample was requested, but usable account content could not be retrieved. Product coverage remains unresolved; this is not evidence that the creator has no products or promotions."));
  wrapper.append(link("Open public sample source", record.sourceUrl));
  if (sampled) {
    wrapper.append(node("p", "", `Returned account: @${record.platformHandle} · ${record.platformName}. ${record.platformVerified ? "TikTok embed reports a verified badge." : "No verified badge reported by the embed."}`));
    if (record.bio) {
      wrapper.append(node("h3", "", "Profile bio"), node("blockquote", "creator-caption", record.bio));
    }
    const posts = node("details", "creator-sampled-posts");
    posts.append(node("summary", "", `View sampled captions (${record.posts.length})`), node("p", "", "Captions are source text, not verified product claims. Videos, audio, on-screen disclosure labels and TikTok Shop anchors were not reviewed. Post dates are not supplied by this source."));
    const list = node("ol", "creator-caption-list");
    for (const post of record.posts) {
      const item = node("li");
      item.append(link("Open original TikTok post", post.url), node("p", "creator-caption", post.caption || "[No caption supplied]"));
      list.append(item);
    }
    posts.append(list);
    wrapper.append(posts);
  }
  const provenance = node("details", "creator-product-sources");
  provenance.append(node("summary", "", "Sampling scope & access notes"), node("p", "", SCREENING.scope), node("p", "", `Retrieved ${record.retrievedAt}. ${record.access}. HTTP status: ${record.httpStatus ?? "not received"}.`));
  if (record.error) provenance.append(node("p", "", `Access result: ${record.error}`));
  if (record.sha256) provenance.append(node("p", "creator-caption", `Source snapshot SHA-256: ${record.sha256}`));
  wrapper.append(provenance);

  const leads = brandLeadsFor(handle);
  if (leads.length) {
    const section = node("section", "creator-brand-leads");
    section.append(node("h3", "", `Product & brand follow-up · ${leads.length}`), node("p", "", "Sourced leads awaiting exact offer, price or relationship verification. These are excluded from priced product totals and calculators."));
    for (const lead of leads) {
      const card = node("article", "creator-product-lead");
      card.append(node("h4", "", lead.title), node("p", "", lead.note), node("p", "", `Access: ${lead.access} · Observed ${lead.observedAt}`), link(lead.sourceLabel, lead.url), node("blockquote", "creator-caption", lead.excerpt));
      section.append(card);
    }
    wrapper.append(section);
  }
  return wrapper;
}
