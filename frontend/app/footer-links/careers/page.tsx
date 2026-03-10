"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CareerJobOpening, getCareerJobOpenings } from "../../../src/services/api";

const benefits = [
  {
    title: "Growth-Focused Culture",
    description: "Work with a high-performing team that values ownership, learning, and fast execution.",
  },
  {
    title: "Meaningful Impact",
    description: "Build products and services that help thousands of customers shop better every day.",
  },
  {
    title: "Competitive Benefits",
    description: "Enjoy competitive compensation, flexible work options, and career development support.",
  },
];

export default function CareersPage() {
  const [openings, setOpenings] = useState<CareerJobOpening[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadOpenings = async () => {
      setIsLoading(true);
      try {
        const data = await getCareerJobOpenings();
        setOpenings(data);
      } catch {
        setOpenings([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadOpenings();
  }, []);

  return (
    <div className="bg-gray-50">
      <section className="bg-gradient-to-r from-primary to-blue-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">Careers at King-Kush</h1>
          <p className="text-lg md:text-xl mt-4 max-w-3xl mx-auto text-blue-100">
            Join a team building a smarter, faster, and more trusted e-commerce experience across Africa.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/footer-links/careers/apply"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:bg-accent-hover transition-colors"
            >
              Apply for a Job
            </Link>
            <Link
              href="/footer-links/about-us"
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              Learn About King-Kush
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-3xl font-black text-gray-900 text-center">Why Join Us</h2>
        <p className="text-gray-600 text-center mt-3 max-w-3xl mx-auto">
          We are building a workplace where people can do their best work, solve real customer problems, and grow fast.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {benefits.map((item) => (
            <div key={item.title} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-900">Current Openings</h2>
              <p className="text-sm text-gray-600 mt-1">Explore active opportunities and submit your application online.</p>
            </div>
            <Link
              href="/footer-links/careers/apply"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
            >
              Apply for a Job
            </Link>
          </div>

          {isLoading ? (
            <p className="px-6 py-6 text-sm text-gray-600">Loading roles...</p>
          ) : openings.length === 0 ? (
            <div className="px-6 py-10 text-sm text-gray-600">
              No open roles are published right now. You can still send a general application.
              <div className="mt-3">
                <Link href="/footer-links/careers/apply" className="text-primary font-semibold hover:underline">
                  Submit General Application
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {openings.map((role) => (
                <div key={role.id} className="px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{role.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {role.location} | {role.department} | {role.employment_type.replace("_", " ")}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{role.summary}</p>
                  </div>
                  <Link
                    href={`/footer-links/careers/apply?position=${encodeURIComponent(role.title)}`}
                    className="inline-flex items-center justify-center rounded-lg border border-primary/30 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
                  >
                    Apply Now
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
