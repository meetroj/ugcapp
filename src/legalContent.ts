// GENERATED (same text as ugcad-frontend/src/data/legalContent.js; regenerate both together) from the owner's legal Google Doc (Privacy Policy, Terms & Conditions, Creator & Brand
// Agreement, Community Guidelines; last updated 28 September 2026). Internal drafting notes in that doc
// (counsel notes, [Insert ...] placeholders, "Regulatory note" paragraphs) are deliberately NOT included.
// Block types: p (paragraph), ul (items), h (sub-heading), table (head, rows).
export type LegalBlock =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };
export type LegalSection = { h: string; blocks: LegalBlock[] };
export type LegalContentDoc = {
  id: string; name: string; desc: string; updated: string; intro: string[]; sections: LegalSection[];
};

export const LEGAL_CONTENT: Record<'privacy' | 'terms' | 'agreement' | 'guidelines', LegalContentDoc> = {
 "privacy": {
  "id": "privacy",
  "name": "Privacy Policy",
  "desc": "How we collect, use and protect your data",
  "updated": "28 September 2026",
  "intro": [
   "This Privacy Policy (\"Policy\") is issued by Crawl Digitally, a company incorporated under the laws of India, with its registered office at 303 Sanrachna Avenue, Satya Sai Square, Dewas Naka Road, Indore, MP 452010 (\"UGCAD.IO,\" \"Company,\" \"we,\" \"us,\" \"our\"), and describes how we collect, use, share, retain, and protect personal data in connection with the UGCAD.IO website (ugcad.io), mobile application, and related services (together, the \"Platform\"). For the purposes of India's Digital Personal Data Protection Act, 2023 (\"DPDP Act\"), UGCAD.IO is the Data Fiduciary for the personal data described here.",
   "This Policy applies to Creators, Brands, applicants who have not yet been approved, and visitors to the Platform, whether you use the website or the app (together, \"you,\" \"User\"). It should be read together with our Terms & Conditions and the Creator & Brand Agreement.",
   "By creating an account, submitting an application, or otherwise using the Platform, you consent to the collection, use, and disclosure of your information as described in this Policy. We also show you a notice at the point where we collect specific data for a specific purpose. If you do not agree, please do not use the Platform."
  ],
  "sections": [
   {
    "h": "1. Information We Collect",
    "blocks": [
     {
      "t": "h",
      "text": "1.1 Information you provide directly"
     },
     {
      "t": "ul",
      "items": [
       "Account information — name/display handle, email, mobile number, password, profile photo.",
       "KYC and identity information (Creators) — full legal name, date of birth, government-issued ID, a verification selfie, bank/UPI payout details, and residential address (used solely for masked shipping and payout; never shown to Brands).",
       "Business information (Brands) — legal business name, GSTIN, business email, website/social handles, billing address, authorized representative details.",
       "Niche/category information — Creators select up to 5 content categories they create in (and may flag categories they will not work in); Brands select a primary business category. Used to match Creators with relevant Briefs and shown on profiles.",
       "Location and language information (Creators) — your city (selected from a list of Indian cities) and the languages you can create content in. Used for matching with relevant Briefs and shown on your profile.",
       "Capacity and rate information (Creators) — your stated monthly content capacity and rate preferences, used for brief matching.",
       "Social media handles (Creators) — your Instagram/YouTube/TikTok handles, collected for internal verification of your authenticity and following. These are not displayed publicly on your profile unless you choose to link them.",
       "Content — portfolio samples, brief responses, scripts and reference material, raw videos, edited videos, revision notes, and dispute evidence. Because Creators appear on camera, your face and voice may be part of the content you submit.",
       "Payment information — wallet transaction history and payout account details. Card/net-banking credentials are captured directly by our payment gateway partners; we do not store full card numbers.",
       "Communications — in-Platform chat, support tickets, correspondence with concierge/support, and notifications sent via email, SMS, WhatsApp, or app push notification. You can opt out of SMS/WhatsApp/push notifications in Settings or your device settings, subject to quiet-hours preferences."
      ]
     },
     {
      "t": "h",
      "text": "1.2 Information collected automatically"
     },
     {
      "t": "ul",
      "items": [
       "Device and log data — IP address, device identifiers, operating system, app version, access timestamps, and crash and error logs.",
       "Usage data and cookies (see Section 6).",
       "App permissions — if you use the mobile app, it may ask for access to your camera, microphone, photos/files, and notifications, so you can record or upload content and receive deal alerts. We use these only for those features. You can change permissions in your device settings, though some features may stop working."
      ]
     },
     {
      "t": "h",
      "text": "1.3 Information from third parties"
     },
     {
      "t": "p",
      "text": "GST verification via the government GST portal API; KYC verification vendor outcomes; payment gateway transaction confirmations; courier partner delivery status; publicly available business information reviewed during vetting."
     }
    ]
   },
   {
    "h": "2. How We Use Your Information",
    "blocks": [
     {
      "t": "p",
      "text": "To vet and onboard Creators and Brands and match Creators to briefs by category, language, location, capacity, and rate; operate the wallet, escrow, commission, invoicing, payout, and tax-withholding functions; enable masked shipping without exposing Creator addresses to Brands; maintain the identity/profile separation described in Section 4; provide Add-on Services at a Brand's request, where our team writes scripts or edits videos and therefore needs access to the relevant brief, script, and video content; run automated screening of in-Platform chat messages and images (including text read from images) to detect attempts to share phone numbers, email addresses, social media handles, or messaging-app links, in order to enforce the anti-poaching provisions of the Creator & Brand Agreement; send notifications and provide support; prevent fraud and investigate disputes; moderate content and enforce watermarking; comply with legal and tax obligations; improve the Platform via aggregated analysis; and, only with consent, send marketing."
     }
    ]
   },
   {
    "h": "3. Legal Basis for Processing",
    "blocks": [
     {
      "t": "p",
      "text": "We process personal data on the basis of: your consent (at sign-up, at the point of collection, and through granular controls for optional uses); the legitimate uses recognised under the DPDP Act, including where you voluntarily provide data for a specific purpose such as completing a Deal, and where processing is needed to comply with the law (KYC, tax reporting) or to prevent fraud. You can withdraw consent at any time; withdrawing may limit features that depend on that data (for example, we cannot pay you without your payout details)."
     }
    ]
   },
   {
    "h": "4. Creator Anonymity and Data Segregation",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "A Creator's real name, government ID, and address are held in a dedicated, encrypted table, accessible only to authorized admin personnel on a role-restricted basis, and never joined to Brand-facing views at the database query level.",
       "Brands see only a Creator's handle, chosen face/portfolio content, category tags, and collaboration history.",
       "A Creator's address is used only to generate a shipping label; it is not disclosed to the Brand.",
       "If a Creator voluntarily discloses their identity to a Brand, anonymity protections no longer apply to that specific relationship.",
       "UGCAD.IO is not responsible for identity discovery through means outside the Platform's control; such conduct may still be penalized if a Brand acts on it.",
       "Where a leak results from a platform fault, we investigate, remediate, and notify/compensate the affected Creator as set out in the Creator & Brand Agreement (Section 3A)."
      ]
     }
    ]
   },
   {
    "h": "5. How We Share Information",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Service providers — payment gateways, courier partners, KYC vendors, cloud hosting, communication providers, analytics and crash-reporting tools — each under contractual data-protection obligations.",
       "Other Users, need-to-know only — a Brand sees a Creator's public handle/portfolio/deal info and the content delivered for its Deal, never real identity or address; a Creator sees a Brand's business name and brief details.",
       "Our team — where a Brand requests Add-on Services, our scripting and editing staff can access the relevant brief and content, under confidentiality obligations.",
       "Legal/regulatory disclosures — to comply with law, a court order, or a lawful government request.",
       "Business transfers — subject to the recipient's continued protection of your data under materially equivalent terms.",
       "With your consent — for anything else, only after explicit consent. We do not, and will not, sell your personal data."
      ]
     }
    ]
   },
   {
    "h": "6. Cookies and Tracking",
    "blocks": [
     {
      "t": "p",
      "text": "Used for authentication, session management, preferences, analytics, and — only with consent — marketing. On the website these can be managed through browser settings. In the app, we may use similar technologies (such as device identifiers and analytics or crash-reporting tools) for the same purposes, and you can manage notifications and permissions in your device settings."
     }
    ]
   },
   {
    "h": "7. Data Security",
    "blocks": [
     {
      "t": "p",
      "text": "AES-256 encryption at rest; TLS 1.2+ in transit; KYC in a separate encrypted table with role-based, admin-only access; mandatory 2FA for admin accounts with session timeouts and optional IP allowlisting for sensitive roles; immutable logging of admin actions and PII access with quarterly reviews; encrypted backups in a separate geographic region; a documented incident-response playbook. No method of storage or transmission is fully secure. We will notify affected users and relevant authorities as required by law in the event of a breach."
     }
    ]
   },
   {
    "h": "8. Data Retention",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Account data: for as long as the account is active.",
       "KYC/identity documents: 7 years after account closure, then securely purged.",
       "Portfolio content (closed Creator accounts): retained 30 days in archive, then deleted.",
       "Brand business/billing records: 7 years.",
       "A closed Creator's handle is reserved and cannot be reused for 1 year.",
       "Chat/deal records tied to a dispute: retained until resolved plus any applicable limitation period.",
       "Submitted videos, scripts, and other Deal content: retained for 1 year. This 1-year period runs from the date of submission, and continues to run even if you delete your account before it ends — this content is not deleted immediately on account closure.",
       "On a platform-initiated ban: email, phone, PAN, and GSTIN may be retained on a blocklist to prevent re-registration, even after other data is purged."
      ]
     }
    ]
   },
   {
    "h": "9. Your Rights",
    "blocks": [
     {
      "t": "p",
      "text": "Subject to applicable law (including the DPDP Act) and the retention limits above, you may: access a summary of your data; correct inaccuracies; request deletion (subject to legal retention); withdraw consent for optional processing; nominate another person to exercise your rights in the event of your death or incapacity; request an export of your data; and lodge a grievance (Section 11). Exercise these via Settings > Account or by writing to support@ugcad.io. We will respond within the timeframe required by law."
     }
    ]
   },
   {
    "h": "10. Age Restriction",
    "blocks": [
     {
      "t": "p",
      "text": "The Platform is for users 18 or older, and by using the Platform, each User represents and warrants that they meet this requirement. Creators additionally have their date of birth checked against their government-issued ID during KYC; if this reveals a Creator applicant is under 18, the application is rejected immediately, the applicant's email/mobile is blocked from reapplying until proof of majority is provided, and any data collected is deleted. Separately, where a Creator's content features a minor (not the Creator themselves), verifiable parental or guardian consent is required, as further detailed in the Creator & Brand Agreement. We do not track or monitor the behaviour of children or direct advertising at them."
     }
    ]
   },
   {
    "h": "11. Grievance Officer and Contact",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Email: support@ugcad.io",
       "Phone: 9039035060",
       "Address: 303 Sanrachna Avenue, Satya Sai Square, Dewas Naka Road, Indore, MP 452010",
       "General privacy questions: support@ugcad.io"
      ]
     },
     {
      "t": "p",
      "text": "We will acknowledge a grievance within 24 hours and aim to resolve it within 15 days of receipt. If you are not satisfied with our response, you may complain to the Data Protection Board of India as provided under the DPDP Act."
     }
    ]
   },
   {
    "h": "12. International Data Storage",
    "blocks": [
     {
      "t": "p",
      "text": "Primarily processed and stored in India. Encrypted backups may be stored in another geographic region solely for redundancy, subject to appropriate safeguards."
     }
    ]
   },
   {
    "h": "13. Third-Party Links",
    "blocks": [
     {
      "t": "p",
      "text": "We are not responsible for the privacy practices of linked third-party sites or a Creator's external social profiles."
     }
    ]
   },
   {
    "h": "14. Changes to This Policy",
    "blocks": [
     {
      "t": "p",
      "text": "We may update this Policy; material changes are notified by email or in-Platform notice, with the \"Last Updated\" date revised accordingly. Continued use after a change constitutes acceptance."
     }
    ]
   },
   {
    "h": "15. Governing Law",
    "blocks": [
     {
      "t": "p",
      "text": "This Policy is governed by the laws of India."
     }
    ]
   }
  ]
 },
 "terms": {
  "id": "terms",
  "name": "Terms and Conditions",
  "desc": "The rules for using the UGCad.io platform",
  "updated": "28 September 2026",
  "intro": [
   "These Terms & Conditions (\"Terms\") govern access to and use of the UGCAD.IO website (ugcad.io), mobile application, and related services (together, the \"Platform\"), operated by Crawl Digitally, with its registered office at 303 Sanrachna Avenue, Satya Sai Square, Dewas Naka Road, Indore, MP 452010 (\"UGCAD.IO,\" \"we,\" \"us,\" \"our\"). UGCAD.IO is a curated marketplace connecting vetted content creators (\"Creators\") with businesses seeking content (\"Brands\") for paid content collaborations. Creators and Brands are together referred to as \"Users,\" \"you.\"",
   "By registering for, accessing, or using the Platform (website or app), you agree to these Terms and our Privacy Policy, incorporated by reference. If you do not agree, you must not use the Platform.",
   "These are the general, Platform-wide terms applicable to all Users. All Users additionally agree to the Creator & Brand Agreement, which sets out the deal-level terms for Creators and Brands and is incorporated by reference. Where a role-specific provision of that Agreement conflicts with these Terms on a matter specific to that role, the Agreement governs (Section 23)."
  ],
  "sections": [
   {
    "h": "1. Definitions",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "\"Creator\" — an individual who has registered and been approved on the Platform to produce content for Brands.",
       "\"Brand\" — a business that has registered and been approved on the Platform to commission content from Creators.",
       "\"Brief\" — a structured content request posted by a Brand, including deliverables, creative requirements, scripting and editing choices, restrictions, and Usage Rights.",
       "\"Deal\" — a Brief accepted by a Creator, or a Custom Offer accepted by a Brand, forming a binding engagement.",
       "\"Custom Offer\" — a proposal initiated by a Creator, within an existing chat with a Brand, setting out the Creator's proposed deliverables and price for that Brand, which becomes a Deal if accepted by the Brand (see Agreement §5).",
       "\"Deliverable\" — a specific piece of content a Creator agrees to produce under a Deal, including a raw video and, where selected, a separately edited version.",
       "\"Raw Video\" — the unedited video a Creator submits as the base deliverable under a Deal.",
       "\"Add-on Services\" — scripting and/or editing services provided by UGCAD.IO's team, at the Brand's request, for a disclosed fee.",
       "\"Wallet\" — the prepaid balance a Brand funds to unlock chat, post Briefs, and pay for Deals.",
       "\"Escrow\" — Deal funds held by UGCAD.IO pending content approval.",
       "\"Usage Rights\" — the platforms, duration, exclusivity, whitelisting, and modification permissions a Brand is granted over approved content, as specified in the Brief.",
       "\"Watermark\" — the visible marking applied to submitted content prior to Brand approval."
      ]
     }
    ]
   },
   {
    "h": "2. Eligibility",
    "blocks": [
     {
      "t": "p",
      "text": "You must be at least 18 years old and have the legal capacity to enter into a binding contract under applicable law. By registering for or using the Platform, you represent and warrant that you meet these requirements, and that all information you provide during registration and verification is true, accurate, and complete. UGCAD.IO reserves the right to independently verify your eligibility at any time and to immediately suspend or terminate your account, without liability to UGCAD.IO, if any representation under this Section is found to be false. The Platform currently supports Indian, GST-registered Brands only, with a demonstrable business presence. Approval to join the Platform is at UGCAD.IO's sole discretion; UGCAD.IO may decline or revoke access to any applicant or User."
     }
    ]
   },
   {
    "h": "3. Account Registration and Vetting",
    "blocks": [
     {
      "t": "p",
      "text": "You agree to provide accurate, current information and to keep it up to date, and are solely responsible for maintaining the confidentiality and security of your account credentials and for all activity under your account. All Creators and Brands are individually, manually reviewed before full access is granted; approval is not guaranteed and may be revoked at any time. One account per individual/business — agencies representing multiple Brands may not operate a single multi-Brand account."
     }
    ]
   },
   {
    "h": "3A. Website and Mobile App",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "These Terms apply equally whether you use the Platform through the website or the mobile app.",
       "The app may request device permissions (for example camera, microphone, photo/file storage, and notifications) needed for features such as content upload and deal alerts. You can manage permissions in your device settings, though some features may not work without them. How your data is handled is described in the Privacy Policy.",
       "We may release app updates and may require you to install the latest version to keep using the Platform.",
       "Apple, Google, and other app-store operators are not parties to these Terms and are not responsible for the Platform. You must also follow the terms of the app store you download from.",
       "Payments, including Wallet recharges, are processed through UGCAD.IO's third-party payment partners, whose terms also apply to those transactions."
      ]
     }
    ]
   },
   {
    "h": "4. Creator Anonymity",
    "blocks": [
     {
      "t": "p",
      "text": "UGCAD.IO keeps a Creator's real identity separate from their Brand-facing profile (see Privacy Policy). You acknowledge that: voluntary disclosure by a Creator to a Brand ends anonymity protection for that relationship; UGCAD.IO is not liable for identity discovery by a Brand through means outside the Platform's control; but a Brand that acts on such information to contact a Creator off-platform violates these Terms and Section 10 below."
     }
    ]
   },
   {
    "h": "5. Briefs, Deals, and Custom Offers",
    "blocks": [
     {
      "t": "p",
      "text": "There is no open bid-board — Creators receive campaigns via private invitation (72-hour response window), ops-mediated shortlisting, or by proactively sending a Custom Offer to a Brand they're already chatting with (subject to the Creator's level-based price floor, a 48-hour expiry, and a 5-per-day cap). A Deal forms once a Brief or Custom Offer is accepted. Once formed, the Deal's terms — deliverables, creative requirements, restrictions, and Usage Rights — are binding on both parties; changes to scope, deadline, or compensation require written agreement via the Platform. Style-guidance fields are directional only and are not grounds for a dispute."
     }
    ]
   },
   {
    "h": "5A. Content Production: Scripting, Filming, and Editing",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Creators submit a Raw Video as the base deliverable.",
       "Scripting: the Brand either supplies its own script, or requests a script from UGCAD.IO's team as an Add-on Service.",
       "Editing: the Brand chooses at the Brief stage either (a) editing by the Creator, which opens a separate paid deliverable slot with its own fee, deadline, and revisions, or (b) editing by UGCAD.IO's team as an Add-on Service. If neither is chosen, the Raw Video is the final deliverable.",
       "Full details are in the Creator & Brand Agreement (Section 5A)."
      ]
     }
    ]
   },
   {
    "h": "6. Wallet, Escrow, Fees, and Payments",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Brands fund a Wallet to unlock chat and post Briefs (minimum ₹5,000 as published on the Platform).",
       "Wallet balance is non-refundable except through an admin-approved refund process, and does not expire.",
       "On Deal acceptance, the Deal value plus commission (and any Add-on Service fees) is debited from the Brand's Wallet and held in Escrow until content is approved.",
       "UGCAD.IO charges a platform commission of 20% of the Deal value to each party: the Brand pays the Deal value plus 20%, and the Creator receives the Deal value minus 20%, before their own TDS. For example, a ₹1,000 Deal costs the Brand ₹1,200 total; the Creator receives ₹800, before TDS.",
       "Add-on Service fees (UGCAD.IO scripting or editing) are disclosed to the Brand before the Brief is finalized, are payable by the Brand in addition to the Deal value and commission, and are not shared with the Creator.",
       "Brands must review submitted content within 5 days; no response results in deemed approval and automatic release of Escrow.",
       "Creator payouts are then queued and disbursed within 12 days, subject to applicable TDS.",
       "Approval (including deemed approval) is final, except via a dispute raised before release (Section 13).",
       "Listing fees apply per campaign tier and are refunded as Wallet credit or forfeited per the conditions in the Creator & Brand Agreement (Section 14)."
      ]
     }
    ]
   },
   {
    "h": "7. Content Ownership, License, and Usage Rights",
    "blocks": [
     {
      "t": "p",
      "text": "Creators retain ownership of content they create. On approval, the Brand receives a license, not ownership, to use the content strictly within the Usage Rights specified in the accepted Brief. Use beyond that scope voids the license for that use and may result in penalties and a takedown demand. Content stays watermarked and reduced-resolution until approval; circumventing or redistributing a watermarked preview is prohibited. Brand-supplied mood boards/reference material are for inspiration only and may not be copied by a Creator."
     },
     {
      "t": "p",
      "text": "Unless a specific accepted Deal carries a non-zero exclusivity period, a Creator may work with any number of Brands, including direct competitors, provided each Deal is delivered on time."
     }
    ]
   },
   {
    "h": "8. Revisions",
    "blocks": [
     {
      "t": "p",
      "text": "Each Deal includes 2 free revision rounds by default; where a Deal has a separate edited-version slot (Section 5A), that slot carries its own revision allowance. Additional revisions carry a fee (e.g., ₹500) payable by the Brand upfront, with a portion credited to the Creator. A revision request for something outside the original Brief is scope creep and may be disputed (Section 13). Five or more revision rounds on one deliverable triggers Company intervention."
     }
    ]
   },
   {
    "h": "9. Content and Conduct Standards",
    "blocks": [
     {
      "t": "p",
      "text": "Content and conduct must be original, lawful, non-defamatory, free of third-party IP claims, and compliant with ASCI disclosure norms. No harassment, fraud, or unlawful conduct. Where content features a minor, verifiable parental/guardian consent is required. Non-public Brief details must be kept confidential by the Creator for 12 months following the Deal."
     },
     {
      "t": "p",
      "text": "In line with applicable Indian law, you must not upload, share, or transmit anything that:"
     },
     {
      "t": "ul",
      "items": [
       "belongs to another person and that you have no right to use, or infringes any patent, trademark, copyright, or other proprietary right;",
       "is obscene, pornographic, paedophilic, invasive of another's privacy, or harmful to a child in any way;",
       "is harassing, defamatory, hateful, racially or ethnically objectionable, or promotes violence or unlawful activity;",
       "deceives or misleads about the origin of a message or impersonates another person;",
       "contains software viruses or code designed to disrupt or gain unauthorized access to any system;",
       "threatens the unity, integrity, defence, security, or sovereignty of India, or public order; or",
       "is knowingly false or misleading, or violates any law in force."
      ]
     },
     {
      "t": "p",
      "text": "UGCAD.IO may remove such content and restrict the account responsible. Restricted and prohibited campaign categories for Brands are set out in the Creator & Brand Agreement (Section 4)."
     }
    ]
   },
   {
    "h": "10. On-Platform Communication and Anti-Poaching",
    "blocks": [
     {
      "t": "p",
      "text": "All Deal-related communication must occur on the Platform. Neither party may engage the other off-platform for 12 months following an introduction made through UGCAD.IO, without UGCAD.IO's consent. Contact-info sharing in chat is auto-blocked, with a three-strike escalation applying to both Creators and Brands. Violation penalty: ₹25,000 per incident, plus suspension or a permanent ban for repeat/willful violations. In addition to these platform penalties, UGCAD.IO reserves the right to pursue legal action — including a civil claim for damages and injunctive relief — against any User who violates this Section, particularly where the violation is intended to circumvent UGCAD.IO's commission or business model."
     }
    ]
   },
   {
    "h": "11. Shipping",
    "blocks": [
     {
      "t": "p",
      "text": "Where a Deal requires a physical product, the Brand ships it by the agreed date through the Platform's masked-shipping process; the Creator's address is never disclosed. The Brand warrants the product matches the Brief and is safe for its intended use. Late shipping, and damaged/wrong/missing-item claims (reportable within 48 hours of delivery), are handled per the timelines and penalties set out in the Creator & Brand Agreement (Section 10)."
     }
    ]
   },
   {
    "h": "12. Product Liability and Health & Safety",
    "blocks": [
     {
      "t": "p",
      "text": "As between a Creator and a Brand, the Brand is solely responsible for the safety of any product it ships, and for any injury, allergic reaction, illness, or damage arising from the Creator's use of it — except where caused by the Creator's own gross negligence or failure to disclose a known condition. UGCAD.IO does not manufacture, sell, test, or certify any product, is not a party to this liability, and disclaims all responsibility for it."
     }
    ]
   },
   {
    "h": "13. Review, Approval, and Dispute Resolution",
    "blocks": [
     {
      "t": "p",
      "text": "Content not reviewed within 5 days is deemed approved and Escrow releases automatically. Disputes must be raised through the in-Platform process before release, with a description, desired outcome, and evidence. Outcomes may include full or partial release/refund, a split ruling, deadline extension, or a no-fault resolution, in which case any Escrow held for that Deal is split 50/50 between the Creator and the Brand. Rulings may be appealed once within 7 days with new evidence; the second ruling is final on-Platform and binding on both parties in respect of that Deal's Escrow, without limiting either party's other legal rights. UGCAD.IO's determinations under this Section are made on a good-faith, reasonable-discretion basis and do not constitute legal adjudication."
     }
    ]
   },
   {
    "h": "14. Release of Claims Regarding User-to-User Disputes",
    "blocks": [
     {
      "t": "p",
      "text": "UGCAD.IO facilitates the connection between Creators and Brands but is not responsible for, and is not a party to, the underlying creative or commercial relationship between them, except as expressly stated in these Terms (e.g., Escrow administration). To the fullest extent permitted by law, each User releases UGCAD.IO from any claim, demand, or damages arising out of a dispute with another User, including disputes over content quality, product condition, payment timing between the parties, or conduct — except to the extent such claim arises from UGCAD.IO's own fraud, gross negligence, or willful misconduct."
     }
    ]
   },
   {
    "h": "15. Suspension, Termination, and Account Closure",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "A User may close their account from Settings > Account; accounts with active Deals must resolve them first.",
       "On Creator closure: pending payout released, portfolio archived 30 days then purged, KYC retained 7 years then purged, handle reserved for 1 year.",
       "On Brand closure: unspent Wallet balance must be refunded first, subject to admin review; business data retained 7 years.",
       "UGCAD.IO may suspend or ban an account, at its sole discretion and without prior notice where warranted, for violations, fraud, repeated anti-poaching breaches, or willful identity-leak attempts. On ban: no rejoining (email/phone/PAN/GSTIN blocklisted); amounts legally owed are still paid; remaining Wallet balance refunded net of outstanding obligations.",
       "Appeal of a suspension or ban: a User who has been suspended or banned under this Section may request review by submitting a written appeal, with supporting evidence, to support@ugcad.io within 14 days of the suspension or ban. UGCAD.IO will review the appeal and respond within a reasonable time. UGCAD.IO's decision on appeal is final. This appeal process is separate from, and does not affect, the Deal-level dispute process in Section 13."
      ]
     }
    ]
   },
   {
    "h": "16. Platform Rights",
    "blocks": [
     {
      "t": "p",
      "text": "UGCAD.IO may showcase anonymized case studies without disclosing identifying information without consent; may modify, suspend, or discontinue features or these Terms with advance notice of material changes; and may moderate, remove, or restrict content or accounts that violate these Terms."
     }
    ]
   },
   {
    "h": "17. Intellectual Property of the Platform",
    "blocks": [
     {
      "t": "p",
      "text": "The UGCAD.IO name, logo, design, and software belong to Crawl Digitally and may not be used without permission. Watermarking exists to protect Creator content pending approval."
     }
    ]
   },
   {
    "h": "18. Representations and Warranties",
    "blocks": [
     {
      "t": "p",
      "text": "Each User represents and warrants that: (a) all information provided to UGCAD.IO is true, accurate, and not misleading; (b) they have full legal right and authority to enter into these Terms and the Creator & Brand Agreement; (c) their use of the Platform will comply with all applicable laws; and (d) any content, product, or material they submit or ship does not infringe or violate the rights of any third party."
     }
    ]
   },
   {
    "h": "19. Disclaimers",
    "blocks": [
     {
      "t": "p",
      "text": "The Platform is provided \"as is\" and \"as available,\" without warranties of any kind, whether express, implied, or statutory, including any implied warranties of merchantability, fitness for a particular purpose, or non-infringement, to the fullest extent permitted by law. The Platform is currently in an early-stage beta phase and may contain bugs, incomplete features, or periods of downtime. UGCAD.IO does not guarantee any particular volume of Briefs, Deals, earnings, or business outcome to any User and is not responsible for the commercial success or failure of any User's use of the Platform. UGCAD.IO is not liable for delays or failures caused by third-party payment, courier, or verification providers, or for identity discovery outside the Platform's control."
     }
    ]
   },
   {
    "h": "20. Limitation of Liability",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Creators: except where liability cannot be limited by law, UGCAD.IO's liability to a Creator is capped at the commission it earned on the specific Deal giving rise to the claim, per the Creator & Brand Agreement.",
       "Brands, and any other matter not covered by a role-specific cap: UGCAD.IO's aggregate liability is capped at the fees actually paid by that User to UGCAD.IO in the 6 months preceding the claim, except in cases of fraud or willful misconduct.",
       "UGCAD.IO is not liable for indirect, incidental, special, punitive, or consequential damages, including loss of profits, business, or goodwill, in either case."
      ]
     }
    ]
   },
   {
    "h": "21. Indemnification",
    "blocks": [
     {
      "t": "p",
      "text": "You agree to indemnify, defend, and hold harmless UGCAD.IO, its officers, employees, and agents, from and against any and all claims, losses, liabilities, damages, and expenses (including reasonable legal fees) arising out of or relating to: (a) your breach of these Terms or the Creator & Brand Agreement; (b) your violation of any law or third-party right; (c) any content, product, or information you submit or ship; and (d) any dispute between you and another User. Brands additionally indemnify Creators for product-related injury or damage as set out in the Creator & Brand Agreement (Sections 11 and 22)."
     }
    ]
   },
   {
    "h": "22. Relationship of Parties",
    "blocks": [
     {
      "t": "p",
      "text": "No employment, partnership, joint venture, or agency relationship is created between UGCAD.IO and any User, or between a Creator and a Brand. Creators act as independent contractors."
     }
    ]
   },
   {
    "h": "23. Relationship to the Creator & Brand Agreement",
    "blocks": [
     {
      "t": "p",
      "text": "These Terms apply to all Users. All Users additionally agree to the Creator & Brand Agreement, incorporated by reference. Where a role-specific provision of that Agreement conflicts with these Terms on a matter specific to that role, the Agreement governs."
     }
    ]
   },
   {
    "h": "24. Notices",
    "blocks": [
     {
      "t": "p",
      "text": "Notices to UGCAD.IO: support@ugcad.io. Notices to a User: the email/phone on file for their account, or an in-Platform notification."
     }
    ]
   },
   {
    "h": "25. Governing Law and Dispute Resolution",
    "blocks": [
     {
      "t": "p",
      "text": "Governed by the laws of India. Unresolved disputes go through an amicable-attempt process, then arbitration under the Arbitration and Conciliation Act, 1996, in English, before a sole arbitrator."
     }
    ]
   },
   {
    "h": "26. Miscellaneous",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Entire agreement — these Terms, the Privacy Policy, and the Creator & Brand Agreement constitute the entire agreement between you and UGCAD.IO, and you confirm you have not relied on any statement not contained in these documents.",
       "Severability — if any provision of these Terms is found by a court or arbitrator of competent jurisdiction to be invalid, illegal, or unenforceable, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions of these Terms will continue in full force and effect.",
       "No waiver — UGCAD.IO's failure to enforce any right or provision of these Terms at any time shall not be construed as a waiver of that right or provision, and will not prevent UGCAD.IO from later enforcing it.",
       "Assignment — UGCAD.IO may assign these Terms on a merger, acquisition, or sale of assets; Users may not assign their rights or obligations under these Terms without UGCAD.IO's prior written consent.",
       "Force majeure — UGCAD.IO is not liable for any failure or delay in performance caused by events beyond its reasonable control, including third-party payment, courier, or verification-provider outages, internet/infrastructure failure, or government action.",
       "Survival — provisions relating to intellectual property, confidentiality, indemnification, limitation of liability, release of claims, and dispute resolution survive termination of your account."
      ]
     }
    ]
   },
   {
    "h": "27. Contact and Grievance Redressal",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Email: support@ugcad.io",
       "Phone: 9039035060",
       "Address: 303 Sanrachna Avenue, Satya Sai Square, Dewas Naka Road, Indore, MP 452010"
      ]
     },
     {
      "t": "p",
      "text": "Complaints about content, accounts, or use of the Platform can be sent to support@ugcad.io. We will acknowledge a complaint within 24 hours and aim to resolve it within 15 days of receipt."
     }
    ]
   }
  ]
 },
 "agreement": {
  "id": "agreement",
  "name": "Creator & Brand Agreement",
  "desc": "Deal-level terms for creators and brands",
  "updated": "28 September 2026",
  "intro": [
   "This Agreement (\"Agreement\") is entered into between Crawl Digitally, with its registered office at 303 Sanrachna Avenue, Satya Sai Square, Dewas Naka Road, Indore, MP 452010 (\"Company,\" \"we,\" \"us\"), and each individual who completes Creator registration and each business that completes Brand registration on the ugcad.io platform and mobile application (the \"Platform\") — each individual Creator and each business Brand being a \"User,\" \"you,\" and together \"Users.\" This Agreement applies uniformly to all Creators and Brands, is not executed by named parties, and is accepted electronically upon completing onboarding and/or (for Brands) funding the wallet, in addition to the general Terms and Conditions and Privacy Policy, both incorporated by reference. By completing onboarding, you agree to be bound by this Agreement.",
   "Sections of this Agreement apply either to all Users, to Creators only, or to Brands only, as indicated."
  ],
  "sections": [
   {
    "h": "1. Role of the Company",
    "blocks": [
     {
      "t": "p",
      "text": "The Company operates the Platform connecting Creators and Brands for user-generated content (\"UGC\") collaborations. The Company facilitates deal-making, wallet/escrow coordination, masked shipping, and dispute support. The Company is not a party to the underlying content-creation relationship between a Creator and a Brand, except as expressly set out here. The Company does not guarantee any particular volume of invitations, Deals, Creator interest, campaign performance, earnings, or business outcome to any User."
     }
    ]
   },
   {
    "h": "2. Eligibility, Onboarding, and Verification",
    "blocks": [
     {
      "t": "p",
      "text": "2.1 Creators. To register, you complete an application (basic details, experience, portfolio), identity verification (KYC — government ID, residential address, bank/UPI payout details), and submit for admin review. Upon approval, you select a public anonymous handle under which you will appear to Brands (see Section 3); the Company may reject a handle that resembles your real name. The Company reserves the right to reject, request more information on, or delay any application at its sole discretion. You confirm you are at least 18 years old and legally capable of entering into this Agreement; if verification reveals you are under 18, your application is rejected and your email/mobile blocked from reapplying until proof of majority is provided. The name on your KYC document must match your bank/payout account name; mismatches block submission until corrected. The Company aims to review applications within 3 business days; unlike content approval (Section 9), there is no automatic approval if this window is missed — some applications go into \"Enhanced Review,\" which may take longer. If rejected, you may reapply after 90 days; incomplete applications are archived after 30 days and deleted after 90 days of inactivity."
     },
     {
      "t": "p",
      "text": "2.2 Brands. To register, you provide business details and complete GST self-verification (a valid, active GSTIN matching your business name). Every Brand is manually reviewed by the Company's admin team, including checks on your website, business legitimacy, and category eligibility (Section 4). The Company may approve, reject, or request more information at its sole discretion, and may request additional documentation for regulated categories."
     }
    ]
   },
   {
    "h": "3. Creator Anonymity and Identity Protection",
    "blocks": [
     {
      "t": "p",
      "text": "3.1 The Company commits to keeping a Creator's real identity (legal name, contact details, address) separate from their Brand-facing profile, which displays only handle, face/work samples, and portfolio."
     },
     {
      "t": "p",
      "text": "3.2 This protection is architectural, not a guarantee against all discovery: if a Creator voluntarily discloses their real identity to a Brand, the Platform's anonymity protection no longer applies to that specific relationship, and the Company is not responsible for consequences of that disclosure. If a Brand identifies a Creator through external means not caused by the Company's failure to safeguard data, the Company is not liable for that discovery — unless the Brand then acts on it (see Section 3A, Category C)."
     },
     {
      "t": "p",
      "text": "3.3 A Creator's real identity is used internally only for KYC, payment/payout, tax compliance, and fraud prevention, stored and accessed separately from Brand-facing systems."
     },
     {
      "t": "p",
      "text": "3.4 A Creator's residential address is used solely to coordinate masked shipping (Section 10) — Brands never receive it directly."
     }
    ]
   },
   {
    "h": "3A. Identity Leak Protection",
    "blocks": [
     {
      "t": "table",
      "head": [
       "Category",
       "What happened",
       "Company response"
      ],
      "rows": [
       [
        "A - Platform fault",
        "A bug, misconfiguration, or admin error exposed a Creator's real name, address, or contact info",
        "Notified, compensated (₹10,000 base, more depending on severity), root cause fixed"
       ],
       [
        "B - Self-disclosure",
        "Creator voluntarily shared their identity with the Brand",
        "No platform penalty available; anonymity protection forfeited for that relationship"
       ],
       [
        "C - Brand discovery",
        "Brand identified the Creator through external means without acting on it",
        "Not penalized unless the Brand then acts on the information"
       ],
       [
        "D - Willful breach",
        "Brand attempts to contact the Creator off-platform using identity info it obtained",
        "Full anti-poaching penalty on the Brand (₹25,000, suspension, possible ban), and the Company may pursue legal action against the Brand - see Section 17"
       ]
      ]
     },
     {
      "t": "p",
      "text": "Creators can report a suspected leak via the in-app reporting form; the Company investigates within 48 hours."
     }
    ]
   },
   {
    "h": "4. Restricted and Prohibited Campaign Categories (Brands)",
    "blocks": [
     {
      "t": "p",
      "text": "Tobacco products (prohibited); Alcohol (case-by-case; most currently rejected); Gambling / real-money gaming (prohibited); Adult content or services (prohibited); Unregulated financial products, including speculative crypto or unregistered investment schemes (prohibited); Weight-loss supplements making medical claims (prohibited); Political campaigns (prohibited); Religious content (prohibited); Dating services (case-by-case). The Company reserves the right to reject or remove any campaign in these categories or otherwise violating applicable advertising or consumer protection law."
     }
    ]
   },
   {
    "h": "5. Campaign Formation: Invitations, Shortlists, Custom Offers, and Briefs",
    "blocks": [
     {
      "t": "p",
      "text": "There is no open bid-board. Campaigns reach a Creator in one of three ways: a private invitation (a Brand sends a Brief directly via chat; Creator has 72 hours to respond); an ops-mediated shortlist (the Company's team shortlists 3–5 matching Creators from a Brand's open Brief); or a Custom Offer initiated by the Creator within an existing chat (subject to the Creator's level-based price floor, a 48-hour expiry, and a 5-per-day cap). A Deal is formed once a Brief is accepted by a Creator, or a Custom Offer is accepted by a Brand. Once formed, the Deal's terms — deliverables, creative requirements, restrictions, product disposition, and Usage Rights — are binding on both parties; changes to scope, deadline, or compensation require written agreement via the Platform. Style-guidance fields are directional only and are not grounds for a dispute."
     },
     {
      "t": "p",
      "text": "Confirming availability (Creators): Before accepting a Brief or sending/accepting a Custom Offer, a Creator is responsible for confirming they will be available for the anticipated shoot and delivery window, including being able to receive a shipped product where applicable. Accepting a Deal is a representation of availability to complete it on the agreed timeline. If a Creator becomes unavailable after accepting, see Sections 12 and 13."
     },
     {
      "t": "p",
      "text": "Deadline extension requests. Either party may request a deadline extension via the Deal Room before the original deadline passes. An extension is only binding once accepted by the other party through the Platform; a one-sided request, or an informal agreement made off-platform, does not change the binding deadline for purposes of Section 13 (Late Delivery) or Section 9 (Approval Timelines)."
     }
    ]
   },
   {
    "h": "5A. Content Production: Scripting, Filming, and Editing",
    "blocks": [
     {
      "t": "p",
      "text": "5A.1 Raw deliverable. A Creator's base deliverable under every Deal is a raw, unedited video. Editing is not the Creator's default responsibility unless the Brand selects the Creator-editing option under 5A.3."
     },
     {
      "t": "p",
      "text": "5A.2 Scripting. At the time of creating a Brief, a Brand chooses one of the following: (a) the Brand supplies its own script or talking points for the Creator to follow; or (b) the Company's team writes the script as an add-on service, for a fee disclosed to the Brand before the Brief is finalized and payable by the Brand in addition to the Deal value and commission under Section 8."
     },
     {
      "t": "p",
      "text": "5A.3 Editing. At the time of creating a Brief, a Brand chooses one of the following: (a) Editing by Creator — this opens a separate, additional deliverable slot in the Deal for the edited version, with its own fee, deadline, and revision allowance under Section 8.2, distinct from the raw-video deliverable; or (b) Editing by the Company's team — an add-on service for a fee disclosed to the Brand before the Brief is finalized and payable by the Brand in addition to the Deal value and commission under Section 8. If the Brand selects neither option, the raw video is the Deal's final deliverable."
     },
     {
      "t": "p",
      "text": "5A.4 Multi-slot Deals. Where a Deal includes more than one deliverable slot under 5A.3(a) (e.g., raw video plus a separately edited version), each slot is reviewed, approved, and paid out under Sections 8 and 9 individually, unless the Brief specifies a single combined payout for the whole Deal."
     }
    ]
   },
   {
    "h": "6. Content Ownership, License, and Usage Rights",
    "blocks": [
     {
      "t": "p",
      "text": "6.1 Creators retain ownership of the content they create."
     },
     {
      "t": "p",
      "text": "6.2 By completing a Deal, the Creator grants the Brand a license, not ownership, to use the content strictly as specified in the Brief, including: platforms (organic and/or paid); duration (1 month to perpetual); an exclusivity period (None / 15 / 30 / 60 / 90 days), selected by the Brand as part of the original Brief — not a separate agreement — during which the Creator agrees not to create similar content for a competing brand (longer exclusivity comes with a suggested, optional price increase, e.g., +25% for 90 days); whitelisting/allowlisting rights; and modification rights (full, limited, or none)."
     },
     {
      "t": "p",
      "text": "6.3 Any use by a Brand beyond what is specified in the Brief is unauthorized, voids the license for that use, and may result in penalties against the Brand — including required additional payment to the Creator, account restrictions, and/or a takedown demand. Creators may report unauthorized use via a dispute (Section 16)."
     },
     {
      "t": "p",
      "text": "6.4 Ambiguity in Usage Rights. If a Brief's Usage Rights terms are genuinely ambiguous (for example, silent on a platform or duration), the ambiguity is resolved in favor of the narrower, more limited use, unless the parties clarify the scope in writing via the Platform before the Deal is accepted. A Brand should not assume broader rights than the Brief clearly states."
     },
     {
      "t": "p",
      "text": "6.5 Draft submissions are shown as watermarked, reduced-resolution previews; full-resolution access is provided only after Brand approval."
     },
     {
      "t": "p",
      "text": "6.6 Brand-supplied mood boards/reference material are provided for creative inspiration only and may not be copied verbatim by a Creator."
     },
     {
      "t": "p",
      "text": "6.7 Unless a specific accepted Deal carries a non-zero exclusivity period, a Creator may work with any number of Brands, including direct competitors, provided each Deal is delivered on time."
     },
     {
      "t": "p",
      "text": "6.8 A Creator represents their content is original and doesn't infringe third-party rights (see also Section 19)."
     }
    ]
   },
   {
    "h": "7. Location, Setting, and Third-Party Participants in Content",
    "blocks": [
     {
      "t": "p",
      "text": "7.1 Brand obligation. Where a Brand requires a specific shooting location, setting, or backdrop (or wishes to prohibit certain settings), the Brand must specify this in the Brief. A location/setting requirement stated in the Brief becomes part of the Deal's binding creative requirements under Section 6.2."
     },
     {
      "t": "p",
      "text": "7.2 Creator obligation. If a Creator shoots content in a location or setting materially different from what the Brief specified, without the Brand's prior approval via the Platform, the Brand may require a reshoot or revision to comply with the Brief. This is a compliance request, not a discretionary revision — it does not count toward the free revision limit under Section 8, and cannot be disputed as scope creep. Conversely, if the Brief did not specify a location or setting requirement, a Brand's after-the-fact objection to the Creator's reasonable choice of location is scope creep and may be disputed by the Creator under Section 16."
     },
     {
      "t": "p",
      "text": "7.3 Third-party participants. If a Creator's agreed creative concept involves another person appearing in the content (e.g., a family member, friend, or other individual), by accepting the Deal the Creator confirms that: (a) that person has agreed to participate and is reasonably expected to be available for the anticipated shoot date(s); and (b) the Creator has, or will obtain, that person's consent for their appearance and likeness to be used as contemplated by the Deal. If that person later becomes unavailable and this prevents delivery as agreed, it is treated as a delay or non-delivery attributable to the Creator under Section 13, unless it independently qualifies as a genuine emergency under Section 15."
     }
    ]
   },
   {
    "h": "8. Fees, Commission, and Revisions",
    "blocks": [
     {
      "t": "p",
      "text": "8.1 The Company charges a commission of 20% of the Deal value to each party separately: the Brand pays the Deal value plus 20% commission on top, and the Creator receives the Deal value minus 20% commission. Worked example: a ₹1,000 Deal costs the Brand ₹1,200 total; the Creator receives ₹800, minus applicable TDS (typically ~10% depending on declared tax status) — netting roughly ₹720, before the Creator's own tax filing."
     },
     {
      "t": "p",
      "text": "8.2 Each Deal includes 2 free revision rounds by default (a Brand may offer more in its Brief). Additional revisions may cost an extra fee (e.g., ₹500, payable by the Brand upfront), with the Creator's share (e.g., ₹300) credited to them. Where a Deal has more than one deliverable slot under Section 5A.3(a), each slot carries its own revision allowance."
     },
     {
      "t": "p",
      "text": "8.3 A revision request for something not in the original Brief is \"scope creep\" — the Brand must withdraw the request or pay for the additional work if disputed and upheld in the Creator's favor (Section 16)."
     },
     {
      "t": "p",
      "text": "8.4 Subjective quality disagreements. A Brand may request revisions or decline to approve content only on the basis that it fails to meet the objective requirements stated in the Brief (e.g., specified deliverable format, required messaging points, location, or product placement). A Brand's purely subjective creative preference — where the content fully complies with the Brief but the Brand simply dislikes the creative execution (e.g., music choice, tone, editing style, camera angle) — is not, by itself, grounds to withhold approval or demand a free revision, and may be disputed as scope creep by the Creator under Section 16. This does not limit a Brand's right to specify detailed, objective creative requirements in the Brief itself before the Deal is accepted."
     },
     {
      "t": "p",
      "text": "8.5 Five or more revision rounds on one deliverable triggers Company intervention."
     },
     {
      "t": "p",
      "text": "8.6 Add-on service fees (scripting and/or editing by the Company's team under Section 5A) are disclosed to the Brand before Brief acceptance and are payable in addition to the Deal value and commission under 8.1; these fees are not shared with the Creator."
     }
    ]
   },
   {
    "h": "9. Wallet, Escrow, and Payment",
    "blocks": [
     {
      "t": "p",
      "text": "9.1 Brands fund a Wallet to unlock chat and post Briefs (minimum ₹5,000). Wallet balance is non-refundable except through an admin-approved refund process, and does not expire. Wallet recharges may include bonus credit at published tiers; a GST invoice is generated automatically for each recharge."
     },
     {
      "t": "p",
      "text": "9.2 On a Creator accepting a Brief (or a Brand accepting a Custom Offer), the Deal value plus commission (and any add-on fees under Section 8.6) is debited from the Brand's Wallet and held in Escrow until content is approved."
     },
     {
      "t": "p",
      "text": "9.3 Brands must review submitted content within 5 days; no response results in deemed approval and automatic release of Escrow to the Creator. Approval (including deemed approval) is final, except via a dispute raised before release (Section 16); a Brand cannot indefinitely withhold approval."
     },
     {
      "t": "p",
      "text": "9.4 Creator payouts are then queued and disbursed within 12 days, subject to applicable TDS; total realistic timeline is up to ~17 days from submission to payout. Creators don't manually withdraw funds — payment auto-transfers via UPI/bank to registered KYC payout details, with a \"Payment scheduled\" notice in the Deal Room followed by a transfer notification. TDS certificates are provided."
     },
     {
      "t": "p",
      "text": "9.5 Escrow independence. Each Deal's Escrow is held and administered separately. A dispute, delay, or issue on one Deal between a Creator and a Brand does not affect, freeze, or delay Escrow funds already held for any other Deal, including other Deals between the same Creator and the same Brand. Once a Deal's funds are debited into Escrow under 9.2, they are held by the Company for that Deal regardless of the Brand's subsequent wallet balance, business status, or account standing, and are payable to the Creator per this Agreement's ordinary approval/dispute process."
     }
    ]
   },
   {
    "h": "10. Products: Shipping, Disposition, Returns, and Damage",
    "blocks": [
     {
      "t": "p",
      "text": "10.1 Shipping obligations (Brand). Where a Deal requires a physical product, the Brand is responsible for shipping it by the date agreed in the Brief, through the Platform's masked-shipping process — the Brand never receives the Creator's address directly. If not shipped within 5 days of the deadline, the Creator may raise a dispute (Section 16). Late shipping incurs a fee payable to the Creator of ₹200/day, up to a maximum of ₹1,000. A late arrival that delays the Creator results in a deadline extension with no penalty to the Creator."
     },
     {
      "t": "p",
      "text": "10.2 Product warranty (Brand). The Brand warrants that any product sent matches the Brief specification, is safe for its intended use, and complies with applicable Indian laws and safety standards for its category (e.g., BIS, FSSAI, Drugs & Cosmetics Rules, as relevant). The Brand must disclose all known risks, ingredients, allergens, and usage warnings to the Creator before use. A pre-shipping checklist confirming product accuracy is a binding representation by the Brand."
     },
     {
      "t": "p",
      "text": "10.3 Product disposition — gift or loaner (Brand). Every Brief involving a physical product must specify whether the product is a gift for the Creator to keep after the Deal, or a loaner that must be returned to the Brand (or disposed of as instructed) after content approval. This is decided by the Brand as part of the Brief and is binding once the Creator accepts the Deal. A Creator may not unilaterally decide to keep a loaner product, condition delivery on being allowed to keep it, or threaten to withhold/cancel a Deal to retain a product the Brief specifies must be returned — doing so is a breach of this Agreement (see Section 13)."
     },
     {
      "t": "p",
      "text": "10.4 Return logistics. Where a product must be returned, the Company coordinates return shipping through the masked-shipping process. Return shipping costs are borne by the Brand, except where the return is necessitated by the Creator's own cancellation (Section 12), in which case reasonable return shipping costs may be deducted from any amount otherwise payable to the Creator."
     },
     {
      "t": "p",
      "text": "10.5 Return condition and damage liability (Creator). A Creator returning a loaner product is responsible for returning it in the same condition received, subject only to reasonable wear from its intended use in creating the content. If returned damaged, lost, or beyond reasonable wear, the cost of the product — as declared by the Brand at the time of shipping, or its reasonable market value — will be billed to the Creator and may be deducted from any amount otherwise payable, or invoiced directly if no further payout is due. This does not apply where the damage is the courier's fault in transit, or was already present/disclosed at delivery (Section 10.6) — in such cases, any claim lies against the courier and/or is a matter between the Creator and the Brand under the Brand's own product/shipping insurance arrangements, and the Company bears no liability for the product's value. Brands should declare an accurate product value at the time of shipping, since this figure governs any damage-liability assessment under this Section."
     },
     {
      "t": "p",
      "text": "10.6 Damaged or wrong product report. A Creator has 48 hours from delivery to report damage or a wrong item (after that, deemed accepted as-is), providing a reason, description (50–500 characters), 2+ photos, and an unboxing video. The Deal pauses, deadline holds, and both parties are notified. If confirmed valid, the Brand must reship or refund (Brand's choice), and the Creator's timeline resets; false claims by the Creator may be penalized, and repeated confirmed valid claims against a Brand may result in probation or suspension of the Brand's account."
     },
     {
      "t": "p",
      "text": "10.7 Address changes go through the Company, never directly between the parties. Lost or misdelivered packages are the courier's fault — the Creator is not penalized. No receipt confirmation 7 days after \"Delivered\" status auto-transitions to \"Received\"; damage can still be reported within 48 hours of that transition."
     }
    ]
   },
   {
    "h": "11. Product Liability and Health & Safety",
    "blocks": [
     {
      "t": "p",
      "text": "11.1 As between a Creator and a Brand, the Brand is solely responsible for product safety, and for any injury, allergic reaction, illness, or damage arising from the Creator's use of it — except where caused by the Creator's own gross negligence or failure to disclose a known personal condition. The Creator must disclose known allergies before accepting a Deal, and must stop use and seek medical help if a reaction occurs."
     },
     {
      "t": "p",
      "text": "11.2 The Brand shall solely bear responsibility, and shall indemnify and hold harmless the Creator and the Company, for any such injury, illness, or property damage, except as noted above."
     },
     {
      "t": "p",
      "text": "11.3 The Company does not manufacture, sell, test, or certify any product, is not a party to this liability, and disclaims all responsibility for it."
     }
    ]
   },
   {
    "h": "12. Creator-Initiated Cancellation After Product Delivery",
    "blocks": [
     {
      "t": "p",
      "text": "If, after a product has been shipped to a Creator for a Deal, the Creator decides not to proceed — whether due to unavailability, a change of mind about commercial terms, or any reason other than a genuine emergency under Section 15 — the Creator must notify the Company and the Brand as soon as possible via the Deal Room. This is treated as a failure to deliver under Section 13: the Creator forfeits their right to payment for that Deal, and the Deal value is refunded to the Brand; the commission the Brand paid on that Deal is retained by the Company and is not refunded. The Creator must also make the product available for return pickup within 5 days of notifying the Company; failure to do so may result in the product's cost being deducted from any future payout, in addition to other applicable penalties under Section 13."
     }
    ]
   },
   {
    "h": "13. Late Delivery Penalties and Brand Cancellation Rights",
    "blocks": [
     {
      "t": "p",
      "text": "13.1 Creator late delivery. Late = 1–24 hrs; Severely late = 24–72 hrs; Failed = 72+ hrs/no delivery. Rolling 6-month escalation:"
     },
     {
      "t": "table",
      "head": [
       "Offense",
       "Consequence"
      ],
      "rows": [
       [
        "1st late",
        "Warning + 5% payout penalty"
       ],
       [
        "2nd late",
        "10% penalty + 60-day level-upgrade pause"
       ],
       [
        "3rd late",
        "15% penalty + 90-day probation"
       ],
       [
        "4th late / 1st severe",
        "25% penalty + 14-day cooldown"
       ],
       [
        "5th late / failure",
        "100% forfeit + account review + possible ban"
       ]
      ]
     },
     {
      "t": "p",
      "text": "Penalties are split 50% to the Brand's wallet, 50% to the Company. If the Creator never delivers at all — whether after escalation reaching \"failure,\" or becoming unavailable mid-deal — the Creator forfeits their right to payment, and the Deal value is refunded to the Brand; the commission the Brand paid on that Deal is retained by the Company and is not refunded. In a genuine emergency, the Creator should contact the Company as early as possible to discuss alternatives before it's treated as a forfeiture."
     },
     {
      "t": "p",
      "text": "13.2 Brand cancellation. A Brand may cancel a Deal before a Creator begins work, subject to the listing-fee refund conditions applicable to that campaign. Cancellation after content delivery goes through the dispute process (Section 16)."
     },
     {
      "t": "p",
      "text": "13.3 Other Brand penalties. Chronic low ratings from Creators (below 3.5) result in restricted posting privileges and a mandatory support call. Confirmed product-fraud (wrong/damaged product) may result in a warning, probation, or suspension."
     }
    ]
   },
   {
    "h": "14. Campaign Listing Fees (Brands)",
    "blocks": [
     {
      "t": "table",
      "head": [
       "Campaign type",
       "Listing fee"
      ],
      "rows": [
       [
        "Single-creator brief (1 deliverable)",
        "₹500"
       ],
       [
        "Single-creator brief (2–5 deliverables)",
        "₹1,500"
       ],
       [
        "Multi-creator campaign (2–10 creators)",
        "₹1,500"
       ],
       [
        "Large multi-creator campaign (11+ creators)",
        "₹3,000"
       ]
      ]
     },
     {
      "t": "p",
      "text": "If the campaign completes successfully (at least one deliverable approved and paid), the listing fee is refunded to the Brand's wallet as credit for future listings. The fee is not refunded where: the Brand cancels before a Creator accepts; no Creator accepts within 14 days; or the campaign is disputed and the Brand's fault is confirmed."
     },
     {
      "t": "p",
      "text": "Multi-creator campaigns. Each Creator on a multi-creator campaign forms a separate Deal, with its own Escrow, deadline, and approval process (see Section 9.5). If one Creator on a multi-creator campaign withdraws, is late, or fails to deliver, this is handled under Section 13 as an individual matter between that Creator and the Brand, and does not affect the Deals, deadlines, or payments of the other Creators on the same campaign. A Brand may request the Company's assistance in identifying a replacement Creator for the affected slot; this is a new Deal subject to the ordinary matching process (Section 5), not an extension of the original Creator's obligations."
     }
    ]
   },
   {
    "h": "15. Illness and Emergency Notification",
    "blocks": [
     {
      "t": "p",
      "text": "No penalty for documented medical emergencies, platform outages, or Brand-caused delays — but only where the affected party notifies the Company and the other party via the Deal Room as soon as reasonably possible, and in any event before the delivery deadline. If a Creator is unwell and unable to film or deliver, this notification requirement applies to them in the same way. The Company may request reasonable supporting documentation (such as a medical note) before waiving a penalty. Notification given only after the deadline has passed, or after the Deal has already escalated to a dispute or forfeiture under Section 12 or 13, will generally not qualify for this exception, though the Company retains discretion to consider genuine emergencies case-by-case. Unfair penalties may be disputed under Section 16."
     }
    ]
   },
   {
    "h": "16. Dispute Resolution",
    "blocks": [
     {
      "t": "p",
      "text": "16.1 Creators can raise a dispute for: a Brand not shipping (5+ days late), a damaged product, scope creep, a Brand not reviewing content, or abusive/off-platform behavior."
     },
     {
      "t": "p",
      "text": "16.2 Brands can raise a dispute for: a Creator not delivering by deadline, content significantly not matching the Brief, Creator unresponsiveness/abandonment, or unprofessional chat behavior. If a Creator never delivers at all, the Deal value is refunded to the Brand — the Creator forfeits payment, and the commission the Brand paid on that Deal is retained by the Company and is not refunded."
     },
     {
      "t": "p",
      "text": "16.3 Cannot raise: once payment is released (including deemed approval) — that's final."
     },
     {
      "t": "p",
      "text": "16.4 How: \"Raise Dispute\" in the Deal Room — type, factual description (100–1000 characters), desired outcome (full/partial refund, deadline extension, content re-do, creator reassignment, or other), and 1+ evidence file. The Deal pauses and Escrow stays held."
     },
     {
      "t": "p",
      "text": "16.5 Timeline:"
     },
     {
      "t": "table",
      "head": [
       "Severity",
       "First response",
       "Resolution"
      ],
      "rows": [
       [
        "Critical (leak, fraud)",
        "4 hours",
        "24 hours"
       ],
       [
        "High (damage, deadline)",
        "24 hours",
        "3 business days"
       ],
       [
        "Medium (scope, quality)",
        "24 hours",
        "5 business days"
       ],
       [
        "Low (communication)",
        "48 hours",
        "7 business days"
       ]
      ]
     },
     {
      "t": "p",
      "text": "16.6 Outcomes: full or partial refund/release, deadline extension, creator reassignment, split ruling, or no-fault resolution. Where a dispute is resolved as no-fault (neither party found responsible), any amount held in Escrow for that Deal is split 50/50 between the Creator and the Brand, consistent with the split used for late-delivery penalties (Section 13.1). The Company's determinations under this Section are made on a good-faith, reasonable-discretion basis and do not constitute legal adjudication."
     },
     {
      "t": "p",
      "text": "16.7 Appeal: within 7 days, new evidence required; the second ruling is final on-platform."
     },
     {
      "t": "p",
      "text": "16.8 Binding only for that Deal's Escrow — does not block either party's other legal rights (Section 27)."
     },
     {
      "t": "p",
      "text": "16.9 The Brief and Platform records are the sole source of truth for a Deal. Verbal conversations, off-platform messages, or informal understandings not reflected in the accepted Brief, an in-Platform Custom Offer, or a written change agreed via the Platform (Section 5) will not be considered in resolving a dispute under this Section."
     }
    ]
   },
   {
    "h": "17. Anti-Poaching / Non-Circumvention and Off-Platform Contact",
    "blocks": [
     {
      "t": "p",
      "text": "17.1 12 months — neither a Creator nor a Brand may engage the other off-platform following an introduction made through the Platform, without the Company's prior consent. This restriction applies equally to both."
     },
     {
      "t": "p",
      "text": "17.2 Violation = ₹25,000 penalty per incident, 90-day suspension, possible permanent ban for repeats, applicable to whichever party violates it. The other party is protected, and may be compensated. In addition, the Company reserves the right to pursue legal action — including a civil claim for damages, injunctive relief, and (where the violating party is a Creator) recovery of the Company's lost commission, fees, and legal costs — against the violating party."
     },
     {
      "t": "p",
      "text": "17.3 Contact-info sharing in chat is auto-blocked; a three-strike system applies to both: warning → chat pause → action-cards-only (14 days) → possible suspension."
     },
     {
      "t": "p",
      "text": "17.4 A User who believes the other party is attempting off-platform contact may report it via the in-app reporting form; the Company may impose platform penalties on the violating party and may request the reporting party's cooperation, including supporting evidence, in any resulting action. False positives can be flagged for admin review."
     }
    ]
   },
   {
    "h": "18. Content and Conduct Standards; Confidentiality",
    "blocks": [
     {
      "t": "p",
      "text": "18.1 A Creator's content and conduct must be original, lawful, non-defamatory, compliant with ASCI disclosure norms, and free of harassment or abuse. Where content features a minor, verifiable parental/guardian consent is required."
     },
     {
      "t": "p",
      "text": "18.2 A Brand's campaigns and business conduct must comply with applicable law, including advertising and consumer-protection law, and all restricted-category and content-disclosure requirements communicated by the Company (Section 4)."
     },
     {
      "t": "p",
      "text": "18.3 Non-public Brief information is usable by a Creator only for that Deal and must be kept confidential for 12 months following the Deal."
     },
     {
      "t": "p",
      "text": "18.4 Unsafe or unlawful requests. A Creator may refuse to perform any part of a Brief that would require them to engage in an unlawful act, or an act that poses an unreasonable risk to their health or safety beyond ordinary product use disclosed under Section 11. Such a refusal, if reasonable and promptly communicated to the Brand and the Company via the Deal Room, is not a late delivery or failure to deliver under Section 13, and does not affect the Creator's right to payment for deliverables already completed in compliance with the Brief. The Company may request details to assess the refusal and may reassign or terminate the Deal accordingly."
     }
    ]
   },
   {
    "h": "19. Independent Contractor Status; Relationship of Parties",
    "blocks": [
     {
      "t": "p",
      "text": "Creators are independent contractors. No employment, partnership, joint venture, or agency relationship is created between the Company and any User, or between a Creator and a Brand."
     }
    ]
   },
   {
    "h": "20. Representations and Warranties",
    "blocks": [
     {
      "t": "p",
      "text": "20.1 Creators represent and warrant that: (a) all information provided to the Company, including during KYC, is true, accurate, and not misleading; (b) they have full legal right and authority to enter into this Agreement; (c) their use of the Platform, and all content submitted, will comply with applicable law and will not infringe or violate any third party's rights; and (d) they will comply with all category, disclosure, and content restrictions communicated by the Company or a Brand."
     },
     {
      "t": "p",
      "text": "20.2 Brands represent and warrant that: (a) their authorized representative is at least 18 years old and has full legal authority to bind the business to this Agreement; (b) all information provided during onboarding, including GSTIN and business details, is true, accurate, and not misleading; (c) their business and all campaigns posted comply with applicable law, including advertising and consumer-protection law; and (d) they will comply with all restricted-category and content-disclosure requirements communicated by the Company."
     }
    ]
   },
   {
    "h": "21. Disclaimers",
    "blocks": [
     {
      "t": "p",
      "text": "The Platform is provided \"as is\" and \"as available.\" The Company does not guarantee any particular volume of invitations, Deals, Creator applications, campaign performance, engagement, earnings, or business/career outcome to any User, and is not responsible for the commercial success or failure of any User's use of the Platform. The Company is not liable for delays or failures caused by third-party payment, courier, or verification providers, or for identity discovery outside the Platform's control."
     }
    ]
   },
   {
    "h": "22. Indemnification",
    "blocks": [
     {
      "t": "p",
      "text": "22.1 Creators agree to indemnify, defend, and hold harmless the Company, its officers, employees, and agents, from claims, losses, liabilities, damages, and expenses (including reasonable legal fees) arising from: (a) the Creator's breach of this Agreement, the Terms and Conditions, or applicable law; (b) any content the Creator submits or represents as original; (c) the Creator's use of a Brand's product; and (d) any dispute between the Creator and a Brand, except to the extent caused by the Company's own fraud, gross negligence, or willful misconduct."
     },
     {
      "t": "p",
      "text": "22.2 Brands agree to indemnify, defend, and hold harmless the Company, its officers, employees, and agents, from claims, losses, liabilities, damages, and expenses (including reasonable legal fees) arising from: (a) the Brand's breach of this Agreement, the Terms and Conditions, or applicable law; (b) any campaign, Brief, or product the Brand submits or ships; (c) any content-usage claim by a third party arising from the Brand's use of approved content beyond its licensed scope; and (d) any dispute between the Brand and a Creator. This is in addition to, and does not limit, a Brand's specific product-liability indemnity to Creators under Section 11.2."
     }
    ]
   },
   {
    "h": "23. Account Closure, Suspension, and Termination",
    "blocks": [
     {
      "t": "p",
      "text": "23.1 Creators: may close their account from Settings > Account; cannot close with active Deals. Pending payout is released, portfolio archived 30 days then purged, KYC retained 7 years then purged, handle reserved for 1 year."
     },
     {
      "t": "p",
      "text": "23.2 Brands: cannot close an account with an unspent wallet balance (request a refund first, subject to admin review) or open Deals. Business data is retained 7 years as required by law."
     },
     {
      "t": "p",
      "text": "23.3 Company-initiated: suspension or ban for violations, fraud, repeated anti-poaching breaches, or willful identity-leak attempts. On ban: no rejoining (email/phone/PAN/GSTIN blocklisted); amounts legally owed are still paid; remaining Wallet balance refunded net of outstanding obligations to the other party."
     }
    ]
   },
   {
    "h": "24. Taxes",
    "blocks": [
     {
      "t": "p",
      "text": "Each User handles their own tax obligations. The Company deducts TDS per Indian law and provides certificates to Creators; the Company provides GST invoices for Brand wallet recharges and may deduct/report TDS where applicable."
     }
    ]
   },
   {
    "h": "25. Platform Rights",
    "blocks": [
     {
      "t": "p",
      "text": "The Company may showcase anonymized case studies of campaigns without disclosing identifying information without the relevant User's consent; may modify, suspend, or discontinue Platform features or this Agreement with advance notice of material changes; and may moderate, remove, or restrict content or accounts that violate this Agreement or the Terms and Conditions."
     }
    ]
   },
   {
    "h": "26. Limitation of Liability",
    "blocks": [
     {
      "t": "p",
      "text": "To Creators: except where liability cannot be limited by law, the Company's liability to a Creator is capped at the commission it earned on the specific Deal giving rise to the claim. To Brands, and any other matter not covered by the above: the Company's aggregate liability is capped at the total fees (commission and listing fees) actually paid by that User to the Company in the 6 months preceding the claim, except in cases of fraud or willful misconduct. The Company is not liable for indirect, incidental, special, punitive, or consequential damages, including loss of profits, business, earnings, or goodwill, in either case."
     }
    ]
   },
   {
    "h": "27. Governing Law and Dispute Resolution",
    "blocks": [
     {
      "t": "p",
      "text": "Governed by the laws of India. Unresolved disputes go through an amicable-attempt process, then arbitration under the Arbitration and Conciliation Act, 1996, in English, before a sole arbitrator."
     }
    ]
   },
   {
    "h": "28. Notices",
    "blocks": [
     {
      "t": "p",
      "text": "Notices to the Company: support@ugcad.io or 9039035060. Notices to a User: the email/phone on file for their account, or an in-Platform notification."
     }
    ]
   },
   {
    "h": "29. Miscellaneous",
    "blocks": [
     {
      "t": "p",
      "text": "This Agreement, the Terms and Conditions, and Privacy Policy form the entire agreement, and each User confirms they have not relied on any statement not contained in these documents. If any provision is found invalid or unenforceable, it will be limited or eliminated to the minimum extent necessary, and the rest continues in full force. The Company's failure to enforce any right or provision at any time is not a waiver of that right. The Company may assign this Agreement on a merger, acquisition, or sale of assets; Users may not assign their rights or obligations without the Company's prior written consent. The Company is not liable for delays caused by events beyond its reasonable control (force majeure). Provisions relating to intellectual property, confidentiality, indemnification, limitation of liability, and dispute resolution survive termination of a User's account."
     }
    ]
   }
  ]
 },
 "guidelines": {
  "id": "guidelines",
  "name": "Community Guidelines",
  "desc": "Standards for creators and brands",
  "updated": "28 September 2026",
  "intro": [
   "These guidelines keep UGCad.io safe and fair for everyone. They sit alongside our Terms & Conditions and Creator & Brand Agreement — if there's ever a conflict, those legal documents govern."
  ],
  "sections": [
   {
    "h": "1. Respect Creator Anonymity",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Don't try to find out, share, or guess a Creator's real identity.",
       "Don't ask a Creator for their real name, number, or address, even casually."
      ]
     }
    ]
   },
   {
    "h": "2. Keep Communication On-Platform",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "All deal-related chat stays inside UGCad.io.",
       "Don't share phone numbers, emails, social handles, or external links in chat — messages containing these are auto-blocked.",
       "Don't try to take a relationship off-platform to avoid fees. This is taken seriously and can lead to suspension."
      ]
     }
    ]
   },
   {
    "h": "3. Be Honest and Accurate",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Creators: don't misrepresent your following, niche, or capabilities.",
       "Brands: don't misrepresent your business, product, or campaign requirements.",
       "Submit only original content — no stolen clips, no copied scripts."
      ]
     }
    ]
   },
   {
    "h": "4. Follow the Brief",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Creators: deliver what the Brief asks for, on time.",
       "Brands: judge content against the Brief, not personal taste. Don't request changes outside what was agreed."
      ]
     }
    ]
   },
   {
    "h": "5. No Harassment or Abuse",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "No threats, hate speech, discrimination, or sexual harassment — in chat, in disputes, or in reviews.",
       "Disagreements happen. Keep them professional; use the dispute process, not personal attacks."
      ]
     }
    ]
   },
   {
    "h": "6. Content Standards",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "No content that's obscene, hateful, defamatory, or illegal.",
       "No content involving a minor without verifiable parental/guardian consent.",
       "Brands: no campaigns in restricted categories (tobacco, gambling, adult content, unregulated financial products, political or religious content, and others listed in the Agreement)."
      ]
     }
    ]
   },
   {
    "h": "7. Product & Shipping Etiquette",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Brands: ship on time and declare an honest product value.",
       "Creators: report damage within 48 hours, and don't misuse or withhold a loaner product."
      ]
     }
    ]
   },
   {
    "h": "8. Play Fair on Fees and Deals",
    "blocks": [
     {
      "t": "ul",
      "items": [
       "Don't ask the other party to bypass the Wallet, Escrow, or commission.",
       "Don't submit false damage, dispute, or leak claims to gain an advantage."
      ]
     }
    ]
   },
   {
    "h": "9. What Happens If You Break These",
    "blocks": [
     {
      "t": "p",
      "text": "Violations are handled under the Terms & Conditions and Creator & Brand Agreement, and can include warnings, chat restrictions, financial penalties, suspension, or a permanent ban — depending on severity and repetition."
     }
    ]
   },
   {
    "h": "10. Report a Problem",
    "blocks": [
     {
      "t": "p",
      "text": "See something wrong? Use the in-app reporting form or email support@ugcad.io. We aim to acknowledge reports within 48 hours."
     }
    ]
   }
  ]
 }
};
