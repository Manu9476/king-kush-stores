"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../src/context/AuthContext";
import {
  CareerApplicationField,
  CareerJobOpening,
  createJobApplication,
  getCareerApplicationFormFields,
  getCareerJobOpenings,
} from "../../../../src/services/api";

function JobApplicationPageContent() {
  const searchParams = useSearchParams();
  const initialPosition = searchParams.get("position")?.trim().toLowerCase() || "";
  const { token } = useAuth();

  const [openings, setOpenings] = useState<CareerJobOpening[]>([]);
  const [fields, setFields] = useState<CareerApplicationField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedOpening, setSelectedOpening] = useState<number | "general" | "">("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setSubmitError("");
      try {
        const [openingData, fieldData] = await Promise.all([
          getCareerJobOpenings(),
          getCareerApplicationFormFields(),
        ]);
        setOpenings(openingData);
        setFields(fieldData);

        const defaults: Record<string, string> = {};
        fieldData.forEach((field) => {
          defaults[field.key] = "";
        });
        setAnswers(defaults);

        if (initialPosition) {
          const match = openingData.find((opening) => opening.title.trim().toLowerCase() === initialPosition);
          if (match) {
            setSelectedOpening(match.id);
          }
        }
      } catch (error: any) {
        setSubmitError(error?.message || "Unable to load the job application form right now.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [initialPosition]);

  const requiredFields = useMemo(() => fields.filter((field) => field.is_required).map((field) => field.key), [fields]);

  const updateAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError("");
    setSuccessMessage("");

    if (!selectedOpening) {
      setSubmitError("Please select the position you are applying for.");
      return;
    }
    if (!cvFile) {
      setSubmitError("Please upload your CV before submitting.");
      return;
    }

    for (const key of requiredFields) {
      if (!answers[key]?.trim()) {
        const fieldLabel = fields.find((field) => field.key === key)?.label || key;
        setSubmitError(`${fieldLabel} is required.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await createJobApplication(
        {
          ...(selectedOpening === "general" ? { job_opening: null } : { job_opening: Number(selectedOpening) }),
          answers,
          cv_file: cvFile,
          cover_letter_file: coverLetterFile,
          certificates_file: certificateFile,
        },
        token,
      );

      setSuccessMessage(response.detail || "Application submitted successfully.");
      const clearedAnswers: Record<string, string> = {};
      fields.forEach((field) => {
        clearedAnswers[field.key] = "";
      });
      setAnswers(clearedAnswers);
      setCvFile(null);
      setCoverLetterFile(null);
      setCertificateFile(null);
    } catch (error: any) {
      setSubmitError(error?.message || "Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: CareerApplicationField) => {
    const commonClassName =
      "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition";
    const label = (
      <label htmlFor={field.key} className="block text-sm font-semibold text-gray-800 mb-2">
        {field.label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </label>
    );

    if (field.field_type === "textarea") {
      return (
        <div key={field.id}>
          {label}
          <textarea
            id={field.key}
            value={answers[field.key] || ""}
            onChange={(e) => updateAnswer(field.key, e.target.value)}
            placeholder={field.placeholder}
            className={`${commonClassName} min-h-32`}
          />
          {field.help_text && <p className="text-xs text-gray-500 mt-1">{field.help_text}</p>}
        </div>
      );
    }

    if (field.field_type === "select") {
      return (
        <div key={field.id}>
          {label}
          <select
            id={field.key}
            value={answers[field.key] || ""}
            onChange={(e) => updateAnswer(field.key, e.target.value)}
            className={commonClassName}
          >
            <option value="">Select an option</option>
            {field.select_options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {field.help_text && <p className="text-xs text-gray-500 mt-1">{field.help_text}</p>}
        </div>
      );
    }

    return (
      <div key={field.id}>
        {label}
        <input
          id={field.key}
          type={field.field_type === "phone" ? "tel" : field.field_type === "number" ? "number" : field.field_type}
          value={answers[field.key] || ""}
          onChange={(e) => updateAnswer(field.key, e.target.value)}
          placeholder={field.placeholder}
          className={commonClassName}
        />
        {field.help_text && <p className="text-xs text-gray-500 mt-1">{field.help_text}</p>}
      </div>
    );
  };

  return (
    <div className="bg-gray-50 min-h-screen py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/footer-links/careers" className="text-sm font-semibold text-primary hover:underline">
            Back to Careers
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100">
            <h1 className="text-2xl md:text-3xl font-black text-gray-900">Job Application</h1>
            <p className="text-sm text-gray-600 mt-2">
              Submit your application directly through King-Kush. Our recruitment team reviews every submission.
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-600">Loading application form...</div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {submitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>
              )}
              {successMessage && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</div>
              )}

              <div>
                <label htmlFor="job_opening" className="block text-sm font-semibold text-gray-800 mb-2">
                  Position Applying For<span className="text-red-500 ml-1">*</span>
                </label>
                <select
                  id="job_opening"
                  value={selectedOpening}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      setSelectedOpening("");
                    } else if (value === "general") {
                      setSelectedOpening("general");
                    } else {
                      setSelectedOpening(Number(value));
                    }
                  }}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                >
                  <option value="">Select a position</option>
                  <option value="general">General Application</option>
                  {openings.map((opening) => (
                    <option key={opening.id} value={opening.id}>
                      {opening.title} - {opening.location}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{fields.map((field) => renderField(field))}</div>

              <div className="border border-gray-200 rounded-xl p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3">File Uploads</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="cv_file" className="block text-sm font-semibold text-gray-800 mb-2">
                      Curriculum Vitae (CV)<span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      id="cv_file"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="cover_letter_file" className="block text-sm font-semibold text-gray-800 mb-2">
                      Cover Letter (PDF or DOC)
                    </label>
                    <input
                      id="cover_letter_file"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setCoverLetterFile(e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="certificates_file" className="block text-sm font-semibold text-gray-800 mb-2">
                      Certificates or Supporting Documents (Optional)
                    </label>
                    <input
                      id="certificates_file"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">All required fields must be completed before submission.</p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobApplicationPage() {
  return (
    <Suspense fallback={<div className="bg-gray-50 min-h-screen py-10 px-4 text-center text-gray-600">Loading application form...</div>}>
      <JobApplicationPageContent />
    </Suspense>
  );
}
