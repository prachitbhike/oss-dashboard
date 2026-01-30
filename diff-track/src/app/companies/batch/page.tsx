import { BatchCompanyForm } from '@/components/BatchCompanyForm';

export default function BatchCompanyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Multiple Companies</h1>
      <BatchCompanyForm />
    </div>
  );
}
