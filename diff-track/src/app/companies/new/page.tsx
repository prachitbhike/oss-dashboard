import { CompanyForm } from '@/components/CompanyForm';

export default function NewCompanyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Company</h1>
      <CompanyForm />
    </div>
  );
}
