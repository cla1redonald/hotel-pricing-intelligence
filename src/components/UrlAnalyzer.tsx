'use client';

import React, { useState, useRef, useId } from 'react';
import { Link } from 'lucide-react';
import { parseHotelUrl } from '@/lib/url-parser';
import { DatePicker } from '@/components/DatePicker';

interface AnalyzeParams {
  hotelName: string;
  listedPrice: number;
  currency: 'GBP' | 'USD' | 'EUR';
  checkInDate: Date;
  source: string;
}

interface UrlAnalyzerProps {
  isLoading: boolean;
  onAnalyze: (params: AnalyzeParams) => void;
}

type Currency = 'GBP' | 'USD' | 'EUR';

export function UrlAnalyzer({ isLoading, onAnalyze }: UrlAnalyzerProps) {
  const urlId = useId();
  const nameId = useId();
  const priceId = useId();
  const currencyId = useId();

  const [url, setUrl] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [listedPrice, setListedPrice] = useState('');
  const [currency, setCurrency] = useState<Currency>('GBP');
  const [source, setSource] = useState<string>('unknown');
  const [checkInDate, setCheckInDate] = useState<Date>(() => new Date());

  const [extractedName, setExtractedName] = useState<string | null>(null);
  const [urlParseError, setUrlParseError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const priceInputRef = useRef<HTMLInputElement>(null);

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setUrl(value);

    if (!value) {
      setExtractedName(null);
      setUrlParseError(null);
      setSource('unknown');
      return;
    }

    const parsed = parseHotelUrl(value);

    if (parsed.hotelName) {
      setHotelName(parsed.hotelName);
      setExtractedName(parsed.hotelName);
      setUrlParseError(null);
      setSource(parsed.source !== 'unknown' ? parsed.source : 'unknown');
      if (parsed.checkInDate) {
        const d = new Date(parsed.checkInDate);
        if (!isNaN(d.getTime())) setCheckInDate(d);
      }
      // Auto-focus price input after URL extraction
      priceInputRef.current?.focus();
    } else {
      setExtractedName(null);
      setUrlParseError("We couldn't extract a hotel name from this URL. Please enter the hotel name manually.");
      setSource('unknown');
    }
  }

  function handleHotelNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setHotelName(e.target.value);
    if (nameError) setNameError(null);
  }

  function handlePriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    setListedPrice(e.target.value);
    if (priceError) setPriceError(null);
  }

  function handleSubmit() {
    let valid = true;

    // Validate hotel name
    if (!hotelName.trim()) {
      setNameError('Please enter the hotel name.');
      valid = false;
    }

    // Validate price
    const priceNum = Number(listedPrice);
    if (!listedPrice || isNaN(priceNum) || priceNum <= 0 || priceNum > 10000) {
      setPriceError('Please enter a realistic nightly rate (£1 – £10,000).');
      valid = false;
    }

    if (!valid) return;

    onAnalyze({
      hotelName: hotelName.trim(),
      listedPrice: priceNum,
      currency,
      checkInDate,
      source,
    });
  }

  const inputClass =
    'w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]';
  const inputStyle = {
    border: '1px solid var(--bg-muted)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="space-y-4 p-4">
      {/* URL input */}
      <div className="space-y-1">
        <label
          htmlFor={urlId}
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Hotel URL
        </label>
        <div className="relative">
          <Link
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          />
          <input
            id={urlId}
            type="url"
            value={url}
            onChange={handleUrlChange}
            placeholder="Paste a Booking.com or hotel URL to check the price..."
            className={inputClass}
            style={{ ...inputStyle, paddingLeft: '2.25rem' }}
          />
        </div>
        {extractedName && (
          <p className="text-xs" style={{ color: 'var(--discount)' }}>
            Extracted: {extractedName}
          </p>
        )}
        {urlParseError && (
          <p className="text-xs" style={{ color: 'var(--premium)' }}>{urlParseError}</p>
        )}
      </div>

      {/* Hotel name input */}
      <div className="space-y-1">
        <label
          htmlFor={nameId}
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Hotel Name
        </label>
        <input
          id={nameId}
          type="text"
          value={hotelName}
          onChange={handleHotelNameChange}
          placeholder="e.g. The Savoy"
          aria-label="Hotel Name"
          className={inputClass}
          style={inputStyle}
        />
        {nameError && (
          <p className="text-xs" style={{ color: 'var(--premium)' }}>{nameError}</p>
        )}
      </div>

      {/* Price and currency row */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label
            htmlFor={priceId}
            className="block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Listed Price
          </label>
          <input
            ref={priceInputRef}
            id={priceId}
            type="number"
            value={listedPrice}
            onChange={handlePriceChange}
            placeholder="250"
            min="1"
            max="10000"
            aria-label="Listed Price"
            className={inputClass}
            style={inputStyle}
          />
          {priceError && (
            <p className="text-xs" style={{ color: 'var(--premium)' }}>{priceError}</p>
          )}
        </div>

        <div className="w-28 space-y-1">
          <label
            htmlFor={currencyId}
            className="block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Currency
          </label>
          <select
            id={currencyId}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            aria-label="Currency"
            className={inputClass}
            style={inputStyle}
          >
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      {/* Check-in date */}
      <div className="space-y-1">
        <span
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Check-in Date
        </span>
        <DatePicker date={checkInDate} onDateChange={setCheckInDate} />
      </div>

      {/* Submit button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isLoading}
        aria-label="Check Price"
        className="w-full py-2 px-4 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        style={{
          backgroundColor: 'var(--gold-500)',
          color: 'var(--text-primary)',
        }}
      >
        {isLoading ? 'Checking…' : 'Check Price'}
      </button>
    </div>
  );
}
