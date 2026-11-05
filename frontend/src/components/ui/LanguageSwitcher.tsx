import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, ChevronDown, Search, Check } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../../i18n'

export interface LanguageSwitcherProps {
  className?: string
}

// Romanized English names to make search & identification effortless across all 21 languages
const LANGUAGE_ENGLISH_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Mandarin Chinese',
  hi: 'Hindi',
  ar: 'Arabic',
  bn: 'Bengali',
  pt: 'Portuguese',
  ru: 'Russian',
  ur: 'Urdu',
  id: 'Indonesian',
  sw: 'Swahili',
  ja: 'Japanese',
  te: 'Telugu',
  mr: 'Marathi',
  ta: 'Tamil',
  gu: 'Gujarati',
  kn: 'Kannada',
  or: 'Odia',
  ml: 'Malayalam',
  pa: 'Punjabi',
  as: 'Assamese',
  mai: 'Maithili',
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const currentCode = i18n.resolvedLanguage || 'en'
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === currentCode) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return SUPPORTED_LANGUAGES
    return SUPPORTED_LANGUAGES.filter((lang) => {
      const nativeName = lang.label.toLowerCase()
      const englishName = (LANGUAGE_ENGLISH_NAMES[lang.code] || '').toLowerCase()
      const code = lang.code.toLowerCase()
      return nativeName.includes(q) || englishName.includes(q) || code.includes(q)
    })
  }, [searchQuery])

  const handleSelectLanguage = (code: string) => {
    void i18n.changeLanguage(code)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Visual interactive pill button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white hover:bg-[#FAFDFB] border text-xs font-medium transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0F5B57]/30 ${
          isOpen
            ? 'border-[#0F5B57] ring-2 ring-[#0F5B57]/20 text-[#0F5B57]'
            : 'border-[#D5E0DB] hover:border-[#0F5B57] text-[#202B2A]'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={t('language.switchLabel')}
      >
        <Globe
          className={`w-3.5 h-3.5 shrink-0 transition-colors ${
            isOpen ? 'text-[#0F5B57]' : 'text-[#0F5B57] group-hover:text-[#0F5B57]'
          }`}
          aria-hidden="true"
        />
        <span className="font-semibold tracking-tight">{currentLang.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#687775] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#0F5B57]' : 'group-hover:text-[#202B2A]'
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-label={t('language.switchLabel')}
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-[#E1E8E4] p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Search Header */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-[#84908D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 21 languages..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F5F8F6] rounded-xl border border-transparent focus:border-[#0F5B57] focus:bg-white focus:outline-none text-[#202B2A] transition-all"
            />
          </div>

          {/* Language Options List */}
          <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1 overscroll-contain">
            {filteredLanguages.map((lang) => {
              const isSelected = currentCode === lang.code
              const englishName = LANGUAGE_ENGLISH_NAMES[lang.code]
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectLanguage(lang.code)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EAF6F0] text-[#0F5B57] font-semibold border border-[#CDE5DA]'
                      : 'text-[#202B2A] hover:bg-[#F2F7F4] border border-transparent'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-xs leading-tight">{lang.label}</span>
                    {englishName && englishName !== lang.label && (
                      <span className="text-[10px] text-[#687775] leading-tight mt-0.5">{englishName}</span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#0F5B57] shrink-0" />}
                </button>
              )
            })}
            {filteredLanguages.length === 0 && (
              <p className="text-center py-4 text-xs text-[#84908D]">No matching languages found</p>
            )}
          </div>
        </div>
      )}

      {/* Accessible native select for screen readers and automated test suites */}
      <select
        value={currentCode}
        onChange={(e) => handleSelectLanguage(e.target.value)}
        aria-label={t('language.switchLabel')}
        className="sr-only"
        tabIndex={-1}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  )
}
