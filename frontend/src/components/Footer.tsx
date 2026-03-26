"use client";

import Link from 'next/link';
import React, { useState } from 'react';
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube } from 'react-icons/fa';
import { GiPayMoney } from "react-icons/gi";
import { FaCcVisa, FaCcMastercard } from "react-icons/fa6";
import { useChatbot } from '../context/ChatbotContext';
import { subscribeToNewsletter } from '../services/api';


const Footer: React.FC = () => {
  const linkStyles = "font-body text-body text-blue-100 hover:text-white underline-offset-4 hover:underline transition-colors duration-300";
  const { toggleChatbot } = useChatbot();
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterState, setNewsletterState] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleNewsletterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = newsletterEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setNewsletterState({ type: "error", message: "Enter your email address to subscribe." });
      return;
    }

    setIsSubscribing(true);
    setNewsletterState(null);

    try {
      const response = await subscribeToNewsletter(normalizedEmail);
      setNewsletterEmail("");
      setNewsletterState({ type: "success", message: response.detail });
    } catch (error: any) {
      setNewsletterState({
        type: "error",
        message: error?.message || "We could not process your subscription right now.",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <footer className="bg-primary text-white pt-20 pb-8 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Top Section: Newsletter and Socials */}
        <div className="flex flex-col md:flex-row justify-between items-center pb-12 mb-12 border-b-2 border-primary-light/20">
          <div className="md:w-1/2 mb-8 md:mb-0">
            <h2 className="font-heading text-h2 mb-2">Join Our Newsletter</h2>
            <p className="font-body text-body text-blue-100 max-w-lg">
              Get exclusive deals, product updates, and more delivered straight to your inbox.
            </p>
          </div>
          <div className="w-full md:w-1/2 max-w-md">
            <form className="flex flex-col gap-3" onSubmit={handleNewsletterSubmit}>
              <div className="flex">
                <input 
                  type="email" 
                  name="newsletter_email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  placeholder="Your email address"
                  aria-label="Email address"
                  className="w-full bg-primary-light/40 border-2 border-primary-light/50 rounded-l-modern py-3 px-5 text-white placeholder-neutral-subtle focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                />
                <button 
                  type="submit"
                  disabled={isSubscribing}
                  className="bg-accent hover:bg-accent-hover text-white font-heading font-semibold py-3 px-8 rounded-r-modern transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubscribing ? "Submitting..." : "Subscribe"}
                </button>
              </div>
              {newsletterState && (
                <p
                  className={`font-body text-small ${
                    newsletterState.type === "success" ? "text-emerald-200" : "text-amber-200"
                  }`}
                >
                  {newsletterState.message}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Middle Section: Link Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-y-10 gap-x-6 pb-12">
          
          {/* Column 1: Need Help? */}
          <div>
            <h3 className="font-heading text-body-lg font-bold mb-5 uppercase tracking-wider">Need Help?</h3>
            <ul className="space-y-4">
              <li><button onClick={toggleChatbot} className={`${linkStyles} text-left`}>Chat with Us</button></li>
              <li><Link href="/footer-links/help-center" className={linkStyles}>Help Center</Link></li>
              <li><Link href="/footer-links/contact-us" className={linkStyles}>Contact Us</Link></li>
            </ul>
          </div>

          {/* Column 2: Useful Links */}
          <div>
            <h3 className="font-heading text-body-lg font-bold mb-5 uppercase tracking-wider">Useful Links</h3>
            <ul className="space-y-4">
              <li><Link href="/footer-links/track-your-order" className={linkStyles}>Track Your Order</Link></li>
              <li><Link href="/footer-links/how-to-order" className={linkStyles}>How to Order</Link></li>
              <li><Link href="/footer-links/return-policy" className={linkStyles}>Return & Refund Policy</Link></li>
              <li><Link href="/footer-links/shipping-and-delivery" className={linkStyles}>Shipping & Delivery</Link></li>
              <li><Link href="/footer-links/store-locator" className={linkStyles}>Store Locator</Link></li>
              <li><Link href="/footer-links/pick-up-stations" className={linkStyles}>Pick-up Stations</Link></li>
              <li><Link href="/footer-links/dispute-resolution" className={linkStyles}>Dispute Resolution Policy</Link></li>
              <li><Link href="/footer-links/corporate-purchase" className={linkStyles}>Corporate & Bulk Purchases</Link></li>
              <li><Link href="/footer-links/advertise" className={linkStyles}>Advertise with King-Kush</Link></li>
              <li><Link href="/footer-links/report-product" className={linkStyles}>Report a Product</Link></li>
              <li><Link href="/footer-links/payment-guidelines" className={linkStyles}>Payment Information Guidelines</Link></li>
              <li><Link href="/footer-links/black-friday" className={linkStyles}>Black Friday</Link></li>
            </ul>
          </div>

          {/* Column 3: About King-Kush */}
          <div>
            <h3 className="font-heading text-body-lg font-bold mb-5 uppercase tracking-wider">About Us</h3>
            <ul className="space-y-4">
              <li><Link href="/footer-links/about-us" className={linkStyles}>About King-Kush</Link></li>
              <li><Link href="/creators" className={linkStyles}>Creators</Link></li>
              <li><Link href="/our-team" className={linkStyles}>Our Team</Link></li>
              <li><Link href="/footer-links/careers" className={linkStyles}>Careers</Link></li>
              <li><Link href="/footer-links/terms-and-conditions" className={linkStyles}>Terms & Conditions</Link></li>
              <li><Link href="/footer-links/privacy-notice" className={linkStyles}>Privacy Notice</Link></li>
            </ul>
          </div>

          {/* Column 4: Make Money With Us */}
          <div>
            <h3 className="font-heading text-body-lg font-bold mb-5 uppercase tracking-wider">Make Money</h3>
            <ul className="space-y-4">
              <li><Link href="/footer-links/sell" className={linkStyles}>Sell on King-Kush</Link></li>
              <li><Link href="/footer-links/vendor-hub" className={linkStyles}>Become a Vendor</Link></li>
              <li><Link href="/footer-links/sales-consultant" className={linkStyles}>Become a Sales Consultant</Link></li>
              <li><Link href="/footer-links/affiliate-program" className={linkStyles}>Affiliate Program</Link></li>
              <li><Link href="/footer-links/city-partner" className={linkStyles}>Become a City Partner</Link></li>
            </ul>
          </div>

          {/* Column 5: International */}
          <div>
            <h3 className="font-heading text-body-lg font-bold mb-5 uppercase tracking-wider">International</h3>
            <ul className="space-y-4">
              <li><Link href="/footer-links/uganda" className={linkStyles}>Uganda</Link></li>
              <li><Link href="/footer-links/tanzania" className={linkStyles}>Tanzania</Link></li>
              <li><Link href="/footer-links/ethiopia" className={linkStyles}>Ethiopia</Link></li>
              <li><Link href="/footer-links/south-sudan" className={linkStyles}>South Sudan</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Section: Copyright, Socials, Payments */}
        <div className="pt-8 mt-8 border-t-2 border-primary-light/20 flex flex-col md:flex-row justify-between items-center text-center">
          <div className="mb-6 md:mb-0">
            <p className="font-body text-body text-neutral-subtle">
              &copy; {new Date().getFullYear()} King-Kush Stores. All Rights Reserved.
            </p>
          </div>
          
          <div className="flex items-center">
            <div className="mr-8">
              <span className="font-heading font-semibold text-body mr-4">Follow Us:</span>
              <div className="inline-flex space-x-5">
                <a href="#" className="text-blue-100 hover:text-white transition-colors"><FaFacebook size={20} /></a>
                <a href="#" className="text-blue-100 hover:text-white transition-colors"><FaTwitter size={20} /></a>
                <a href="#" className="text-blue-100 hover:text-white transition-colors"><FaInstagram size={20} /></a>
                <a href="#" className="text-blue-100 hover:text-white transition-colors"><FaYoutube size={20} /></a>
              </div>
            </div>

            <div>
              <span className="font-heading font-semibold text-body mr-4">Payments:</span>
              <div className="inline-flex items-center space-x-4">
                <GiPayMoney size={40} className="text-green-500" />
                <FaCcVisa size={28} />
                <FaCcMastercard size={28} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
