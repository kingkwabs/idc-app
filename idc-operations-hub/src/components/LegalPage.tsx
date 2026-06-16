import { Link } from "react-router-dom";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";

type LegalPageKind = "privacy" | "eula";

interface LegalSection {
  title: string;
  body: string[];
}

const lastUpdated = "June 12, 2026";
const contactEmail = "admin@idcenergy.com";

const privacySections: LegalSection[] = [
  {
    title: "1. Overview",
    body: [
      "IDC Energy Database is an internal operations platform used by IDC Energy to manage client RFQs, purchase orders, suppliers, shipments, documents, invoices, activity records, and related financial workflow data.",
      "This Privacy Policy explains how the application collects, uses, stores, and protects information, including information that may be exchanged with QuickBooks Online through the application's QuickBooks integration.",
    ],
  },
  {
    title: "2. Information We Collect",
    body: [
      "Account information, such as employee name, email address, role, hashed password, and authentication metadata.",
      "Business operations data, such as client names, supplier names, transaction records, RFQ numbers, purchase order numbers, item descriptions, quote amounts, associated costs, shipment details, activity logs, and uploaded business documents.",
      "QuickBooks integration data, such as QuickBooks company identifiers, OAuth tokens, customer identifiers, invoice identifiers, invoice numbers, invoice totals, and invoice-related transaction details required to create or reconcile invoices.",
      "Technical information, such as request metadata, error logs, and operational diagnostics used to secure and maintain the application.",
    ],
  },
  {
    title: "3. How We Use Information",
    body: [
      "To operate the IDC Energy Database and support transaction management, supplier management, document handling, shipment tracking, invoice preparation, employee access control, and audit logging.",
      "To connect with QuickBooks Online when authorized, including creating customers or invoices, storing QuickBooks references, and maintaining integration status.",
      "To troubleshoot, secure, improve, and maintain the application and related infrastructure.",
      "To comply with internal business, accounting, audit, security, and legal obligations.",
    ],
  },
  {
    title: "4. QuickBooks Data",
    body: [
      "The application accesses QuickBooks data only after an authorized administrator connects the application to a QuickBooks company through Intuit's OAuth authorization process.",
      "QuickBooks access tokens and refresh tokens are stored to maintain the integration. These tokens are used only to perform authorized QuickBooks actions for IDC Energy business operations.",
      "The application may send transaction, client, document, and invoice-related information to QuickBooks when creating or managing invoices. The application may store QuickBooks identifiers returned by QuickBooks so records can be reconciled later.",
    ],
  },
  {
    title: "5. Sharing and Disclosure",
    body: [
      "Information is used for IDC Energy business operations and is not sold.",
      "Information may be shared with service providers that host, secure, operate, or support the application, including cloud hosting, database, logging, authentication, and accounting integration providers.",
      "Information may be disclosed if required by law, regulation, legal process, audit requirement, or to protect the rights, security, or operations of IDC Energy.",
    ],
  },
  {
    title: "6. Data Security",
    body: [
      "The application uses access controls, role-based permissions, hashed passwords, token-based authentication, and managed infrastructure controls to help protect information.",
      "No system can guarantee absolute security. Users must protect their login credentials and immediately report suspected unauthorized access.",
    ],
  },
  {
    title: "7. Data Retention",
    body: [
      "Business records are retained for as long as needed for operational, accounting, audit, compliance, and legal purposes.",
      "QuickBooks tokens may be deleted when the QuickBooks integration is disconnected. Some historical transaction or invoice references may be retained for reconciliation and audit purposes.",
    ],
  },
  {
    title: "8. User Choices and Access",
    body: [
      "Authorized users may update certain profile information within the application. Administrators may manage employee access and roles.",
      "Requests about access, correction, deletion, or restriction of data should be directed to the contact listed below and will be handled according to applicable business, legal, accounting, and security requirements.",
    ],
  },
  {
    title: "9. Changes to This Policy",
    body: [
      "IDC Energy may update this Privacy Policy from time to time. The updated version will be posted in the application with a revised effective date.",
    ],
  },
  {
    title: "10. Contact",
    body: [
      `Questions about this Privacy Policy or the application's handling of data may be sent to ${contactEmail}.`,
    ],
  },
];

const eulaSections: LegalSection[] = [
  {
    title: "1. Agreement",
    body: [
      "This End User License Agreement governs access to and use of IDC Energy Database, an internal transaction management application operated for IDC Energy business operations.",
      "By accessing or using the application, you agree to this EULA. If you do not agree, do not use the application.",
    ],
  },
  {
    title: "2. Authorized Use",
    body: [
      "The application is provided only for authorized IDC Energy employees, contractors, administrators, and approved business users.",
      "Users may access the application only for legitimate IDC Energy business purposes, including managing RFQs, transactions, suppliers, purchase orders, shipments, documents, invoices, employees, and related activity records.",
    ],
  },
  {
    title: "3. Accounts and Security",
    body: [
      "Users are responsible for maintaining the confidentiality of their login credentials and for all activity under their accounts.",
      "Users must not share credentials, bypass access controls, access data without authorization, or allow unauthorized third parties to use the application.",
      "Suspected unauthorized access, credential exposure, data loss, or security incidents must be reported promptly to an administrator.",
    ],
  },
  {
    title: "4. QuickBooks Integration",
    body: [
      "Administrators may authorize the application to connect to QuickBooks Online through Intuit's authorization process.",
      "When connected, the application may create or update QuickBooks-related business records, including customers, invoices, invoice references, and related transaction information.",
      "Users are responsible for confirming that transaction, invoice, customer, and accounting information is accurate before using it for business, accounting, tax, or financial reporting purposes.",
    ],
  },
  {
    title: "5. Restrictions",
    body: [
      "Users may not copy, modify, reverse engineer, disrupt, resell, sublicense, or use the application outside authorized IDC Energy business purposes.",
      "Users may not upload malicious files, enter unlawful content, interfere with system availability, attempt unauthorized access, or use the application in a way that violates law, regulation, contract, or company policy.",
    ],
  },
  {
    title: "6. Data and Content",
    body: [
      "Business records entered into the application remain IDC Energy business records or records controlled by the appropriate business owner.",
      "Users are responsible for ensuring that uploaded documents and entered information are accurate, appropriate, and authorized for use in the application.",
    ],
  },
  {
    title: "7. Ownership",
    body: [
      "The application, including its software, design, workflows, code, and documentation, is owned by or licensed to IDC Energy or its authorized providers.",
      "No ownership rights are transferred to users except the limited right to access and use the application as authorized under this EULA.",
    ],
  },
  {
    title: "8. Availability and Changes",
    body: [
      "The application may be updated, suspended, limited, or discontinued at any time for maintenance, security, operational, compliance, or business reasons.",
      "Features may change as the application evolves, including the QuickBooks integration and related transaction workflows.",
    ],
  },
  {
    title: "9. Disclaimer",
    body: [
      "The application is provided as an operational business tool. To the maximum extent permitted by law, it is provided without warranties of uninterrupted availability, error-free operation, or fitness for a particular purpose.",
      "The application does not replace professional accounting, tax, legal, compliance, or financial advice.",
    ],
  },
  {
    title: "10. Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, IDC Energy and its providers will not be liable for indirect, incidental, special, consequential, punitive, or exemplary damages arising from use of or inability to use the application.",
    ],
  },
  {
    title: "11. Termination",
    body: [
      "Access may be suspended or terminated at any time if a user no longer requires access, violates this EULA, violates company policy, creates security risk, or uses the application outside authorized purposes.",
    ],
  },
  {
    title: "12. Contact",
    body: [
      `Questions about this EULA may be sent to ${contactEmail}.`,
    ],
  },
];

const pageContent = {
  privacy: {
    title: "Privacy Policy",
    subtitle: "How IDC Energy Database handles operational and QuickBooks integration data.",
    icon: ShieldCheck,
    sections: privacySections,
  },
  eula: {
    title: "End User License Agreement",
    subtitle: "Terms for authorized use of IDC Energy Database.",
    icon: FileText,
    sections: eulaSections,
  },
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const content = pageContent[kind];
  const Icon = content.icon;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 text-gray-900">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Button asChild variant="outline" className="bg-white/80">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </Link>
          </Button>
          <div className="text-right text-sm text-gray-500">
            Last updated: {lastUpdated}
          </div>
        </div>

        <section className="mb-10 border-b border-gray-200 pb-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-teal-600 text-white shadow-sm">
            <Icon className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-gray-950 sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
            {content.subtitle}
          </p>
        </section>

        <article className="space-y-8">
          {content.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-semibold text-gray-950">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7 text-gray-700 sm:text-base">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
