import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">Pharmacy Inventory & FEFO Dispensing</div>
        <h1 className="hero-title">
          Eliminate Expired Stock with Intelligent <span className="highlight-text">FEFO Dispensing</span>
        </h1>
        <p className="hero-subtitle">
          PharmaStock is a modern pharmacy inventory system engineered to prevent dispensing expired medications,
          automate <strong>First Expiry, First Out (FEFO)</strong> batch allocation, and maintain precise sellable stock.
        </p>

        <div className="hero-cta-group">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-primary btn-large">
              Go to Dashboard &rarr;
            </Link>
          ) : (
            <>
              <Link to="/register" className="btn-primary btn-large">
                Get Started Free
              </Link>
              <Link to="/login" className="btn-secondary btn-large">
                Sign In to Portal
              </Link>
            </>
          )}
        </div>
      </section>

      {/* The Core Problem Solved */}
      <section className="problem-solution-section">
        <div className="section-header">
          <h2>The Problem with Traditional Pharmacy Systems</h2>
          <p>Manual stock rotation and naive inventory counters put patient health and pharmacy revenue at risk.</p>
        </div>

        <div className="problem-grid">
          <div className="problem-card">
            <div className="card-icon alert-icon">&times;</div>
            <h3>Expired Dispensing Hazards</h3>
            <p>
              Dispensing an expired antibiotic or critical medication can cause severe patient harm, clinical failure,
              and catastrophic regulatory penalties.
            </p>
          </div>

          <div className="problem-card">
            <div className="card-icon alert-icon">&times;</div>
            <h3>Stock Distortion</h3>
            <p>
              Standard ERPs report total units in the warehouse—hiding the fact that dozens of expired boxes are
              physically unsellable, causing surprise stockouts.
            </p>
          </div>

          <div className="problem-card">
            <div className="card-icon alert-icon">&times;</div>
            <h3>Inventory Waste & Spoilage</h3>
            <p>
              Without strict FEFO dispatching, newer batches are inadvertently picked first while older batches sit
              at the back of the shelf until they expire.
            </p>
          </div>
        </div>
      </section>

      {/* How PharmaStock Helps */}
      <section className="features-section">
        <div className="section-header">
          <h2>Built for Clinical Accuracy & Operational Speed</h2>
          <p>Every query and transaction is fortified with First-Expiry First-Out business logic.</p>
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-step">01</span>
            <h3>Guaranteed FEFO Order</h3>
            <p>
              Candidate batches are locked and consumed chronologically by <code>expiry_date ASC</code>. Earlier batches
              are depleted first before touching subsequent inventory.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-step">02</span>
            <h3>Strict Sellable Stock Filters</h3>
            <p>
              Expired batches (<code>expiry_date &lt; CURDATE()</code>) and zero-quantity records are dynamically excluded from
              all sellable inventory totals.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-step">03</span>
            <h3>Atomic Transactions</h3>
            <p>
              MySQL InnoDB row locks (<code>FOR UPDATE</code>) protect concurrent requests. If stock is insufficient, the
              entire transaction rolls back with zero partial deductions.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-step">04</span>
            <h3>Full Batch Audit Trails</h3>
            <p>
              Every dispensing event records line-item consumption mapping the exact batch numbers and quantities deducted
              for complete traceability.
            </p>
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="audience-section">
        <div className="section-header">
          <h2>Who Is PharmaStock For?</h2>
          <p>Tailored for healthcare providers and pharmacists demanding compliance and zero tolerance for expired stock.</p>
        </div>

        <div className="audience-grid">
          <div className="audience-card">
            <h4>Hospital Pharmacies</h4>
            <p>Manage high-turnover inpatient dispensaries with multi-batch tracking and rapid emergency lookups.</p>
          </div>
          <div className="audience-card">
            <h4>Retail & Community Drugstores</h4>
            <p>Maximize shelf rotation profitability and maintain spotless safety records during regulatory audits.</p>
          </div>
          <div className="audience-card">
            <h4>Clinics & Specialized Centers</h4>
            <p>Track sensitive biologics, vaccines, and antibiotics with strict expiry countdown notifications.</p>
          </div>
        </div>
      </section>

      {/* Planned Future Features */}
      <section className="roadmap-section">
        <div className="section-header">
          <h2>Planned Future Roadmap</h2>
          <p>Upcoming enhancements currently scheduled for upcoming release cycles.</p>
        </div>

        <div className="roadmap-grid">
          <div className="roadmap-card">
            <span className="roadmap-tag">Roadmap 1</span>
            <h3>Automated Low-Stock Reorder Triggers</h3>
            <p>
              Configurable minimum safety thresholds per medicine that automatically trigger supplier reorder warnings
              before stockouts occur.
            </p>
          </div>

          <div className="roadmap-card">
            <span className="roadmap-tag">Roadmap 2</span>
            <h3>Inventory & Sales Analytics</h3>
            <p>
              Visual trends on fast-moving medications, seasonal demand surges, and historical batch wastage reduction
              metrics.
            </p>
          </div>

          <div className="roadmap-card">
            <span className="roadmap-tag">Roadmap 3</span>
            <h3>Supplier & Purchase-Order Management</h3>
            <p>
              End-to-end procurement workflows: vendor pricing catalogs, barcode intake for new batches, and purchase
              order reconciliation.
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action Footer Banner */}
      <section className="cta-banner">
        <h2>Ready to upgrade your pharmacy operations?</h2>
        <p>Start dispensing with 100% FEFO accuracy today.</p>
        <div className="cta-buttons">
          <Link to="/register" className="btn-primary btn-large">
            Create Pharmacist Account
          </Link>
          <Link to="/login" className="btn-outline btn-large">
            Sign In
          </Link>
        </div>
      </section>
    </div>
  );
}
