import React from 'react';

const CookiesNoticePage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-4xl font-bold mb-6">Cookies Notice</h1>
        <p className="text-sm text-gray-500 mb-6">Last Updated: 06 March 2026</p>
        
        <div className="prose lg:prose-lg max-w-none text-gray-700">
          <p>This notice explains what cookies are and how King-Kush Stores ("we", "us", or "our") uses them on our website. We encourage you to read the full notice so that you can understand what information we collect using cookies and how that information is used.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">What Are Cookies?</h2>
          <p>Cookies are small text files that are stored on your computer or mobile device when you visit a website. They are widely used to make websites work, or work more efficiently, as well as to provide information to the owners of the site.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">How We Use Cookies</h2>
          <p>We use cookies for a variety of reasons, including:</p>
          <ul>
            <li><strong>Essential Cookies:</strong> These are necessary for the website to function and cannot be switched off. They are usually only set in response to actions made by you, such as setting your privacy preferences, logging in, or filling in forms.</li>
            <li><strong>Performance Cookies:</strong> These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.</li>
            <li><strong>Functionality Cookies:</strong> These enable the website to provide enhanced functionality and personalization, such as remembering your preferences.</li>
            <li><strong>Advertising Cookies:</strong> These cookies may be set through our site by our advertising partners to build a profile of your interests and show you relevant adverts on other sites.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Your Choices</h2>
          <p>You can control and/or delete cookies as you wish. You can delete all cookies that are already on your computer and you can set most browsers to prevent them from being placed. If you do this, however, you may have to manually adjust some preferences every time you visit a site and some services and functionalities may not work.</p>
        </div>
      </div>
    </div>
  );
};

export default CookiesNoticePage;
