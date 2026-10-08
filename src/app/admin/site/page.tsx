import SiteSettingsForm from "@/components/SiteSettingsForm";

export default function AdminSitePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Site</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          The words, logo and color customers see. Leave a field empty to use the default.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-stone-200 p-5 max-w-xl">
        <SiteSettingsForm />
      </section>
    </div>
  );
}
