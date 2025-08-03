'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Download, Upload, Edit, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Translation {
  id: string;
  keyPath: string;
  namespace: string;
  en: string;
  th: string;
  context?: string;
  lastUpdated: string;
  isApproved: boolean;
  keyId: number;
}

interface TranslationKey {
  id: number;
  key_path: string;
  namespace: { namespace: string };
  context?: string;
  translations: Array<{
    locale: string;
    value: string;
    is_approved: boolean;
    updated_at: string;
  }>;
}

export default function TranslationManagement() {
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTranslation, setEditingTranslation] = useState<Translation | null>(null);
  const [editValues, setEditValues] = useState({ en: '', th: '', reason: '' });
  const [reviewFilter, setReviewFilter] = useState<string>('all'); // 'all', 'unreviewed', 'reviewed'

  const namespaces = ['all', 'auth', 'booking', 'vip', 'common', 'email', 'errors', 'navigation', 'footer', 'foodItems', 'drinkItems'];

  useEffect(() => {
    // TODO: Re-enable authentication check before production deployment
    // Currently disabled for feature branch development
    fetchTranslations();
    
    // Original authentication-based logic:
    // if (status === 'authenticated') {
    //   fetchTranslations();
    // }
  }, [selectedNamespace, searchTerm, reviewFilter]);

  const fetchTranslations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedNamespace !== 'all') params.set('namespace', selectedNamespace);
      if (searchTerm) params.set('search', searchTerm);
      if (reviewFilter !== 'all') params.set('reviewFilter', reviewFilter);

      const response = await fetch(`/api/admin/translations?${params}`);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch translations');
      }

      const data = await response.json();
      
      // Transform the data
      const transformedTranslations: Translation[] = data.translations.map((item: TranslationKey) => {
        const enTranslation = item.translations.find(t => t.locale === 'en');
        const thTranslation = item.translations.find(t => t.locale === 'th');
        
        return {
          id: `${item.id}`,
          keyId: item.id,
          keyPath: item.key_path,
          namespace: item.namespace?.namespace || 'unknown',
          en: enTranslation?.value || '',
          th: thTranslation?.value || '',
          context: item.context,
          lastUpdated: enTranslation?.updated_at || thTranslation?.updated_at || '',
          isApproved: (enTranslation?.is_approved && thTranslation?.is_approved) || false
        };
      });

      setTranslations(transformedTranslations);
    } catch (error) {
      console.error('Error fetching translations:', error);
      toast.error('Failed to load translations');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTranslation = (translation: Translation) => {
    setEditingTranslation(translation);
    setEditValues({
      en: translation.en,
      th: translation.th,
      reason: ''
    });
  };

  const handleSaveTranslation = async () => {
    if (!editingTranslation) return;

    try {
      // Update English translation
      const enResponse = await fetch('/api/admin/translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: editingTranslation.keyId,
          locale: 'en',
          value: editValues.en,
          reason: editValues.reason
        })
      });

      // Update Thai translation
      const thResponse = await fetch('/api/admin/translations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: editingTranslation.keyId,
          locale: 'th',
          value: editValues.th,
          reason: editValues.reason
        })
      });

      if (!enResponse.ok || !thResponse.ok) {
        throw new Error('Failed to update translation');
      }

      toast.success('Translation updated successfully');
      setEditingTranslation(null);
      fetchTranslations();
    } catch (error) {
      console.error('Error saving translation:', error);
      toast.error('Failed to save translation');
    }
  };


  const handleApproveTranslation = async (translation: Translation) => {
    try {
      // Approve both English and Thai translations
      const enResponse = await fetch('/api/admin/translations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: translation.keyId,
          locale: 'en'
        })
      });

      const thResponse = await fetch('/api/admin/translations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: translation.keyId,
          locale: 'th'
        })
      });

      if (!enResponse.ok || !thResponse.ok) {
        throw new Error('Failed to approve translation');
      }

      toast.success('Translation approved successfully');
      fetchTranslations();
    } catch (error) {
      console.error('Error approving translation:', error);
      toast.error('Failed to approve translation');
    }
  };

  const handleUnapproveTranslation = async (translation: Translation) => {
    try {
      // Unapprove both English and Thai translations
      const enResponse = await fetch('/api/admin/translations/unapprove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: translation.keyId,
          locale: 'en'
        })
      });

      const thResponse = await fetch('/api/admin/translations/unapprove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: translation.keyId,
          locale: 'th'
        })
      });

      if (!enResponse.ok || !thResponse.ok) {
        throw new Error('Failed to mark translation as needing review');
      }

      toast.success('Translation marked as needing review');
      fetchTranslations();
    } catch (error) {
      console.error('Error marking translation as needing review:', error);
      toast.error('Failed to mark translation as needing review');
    }
  };

  const filteredTranslations = translations.filter(translation => {
    const matchesNamespace = selectedNamespace === 'all' || translation.namespace === selectedNamespace;
    const matchesSearch = !searchTerm || 
      translation.keyPath.toLowerCase().includes(searchTerm.toLowerCase()) ||
      translation.en.toLowerCase().includes(searchTerm.toLowerCase()) ||
      translation.th.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesNamespace && matchesSearch;
  });

  // Removed session loading check since authentication is disabled

  // TODO: Re-enable authentication before production deployment
  // Currently disabled for feature branch development
  
  // if (status === 'loading') {
  //   return (
  //     <div className="flex items-center justify-center min-h-screen">
  //       <Loader2 className="h-8 w-8 animate-spin" />
  //     </div>
  //   );
  // }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Translation Management</h1>
          <div className="text-sm text-gray-600 sm:text-right">
            Total: {filteredTranslations.length} translations
          </div>
        </div>
        
        {/* Instructions - Collapsible on mobile */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">How to Use</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1 sm:space-y-2 text-xs sm:text-sm">
              <li>Edit translations by clicking the "Edit" button</li>
              <li>Edits are automatically approved when saved</li>
              <li>Use filters to find specific translations</li>
              <li className="hidden sm:list-item">Run export: <code className="bg-gray-100 px-2 py-1 rounded text-xs">npx tsx scripts/export-translations-simple.js</code></li>
              <li className="sm:hidden">Run export script locally after changes</li>
              <li>Test and redeploy your application</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Filters - Stack on mobile */}
      <Card className="mb-4 sm:mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-0">
          {/* Mobile: Stack filters vertically */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 sm:flex-none">
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map(ns => (
                    <SelectItem key={ns} value={ns}>
                      {ns === 'all' ? 'All Namespaces' : ns.charAt(0).toUpperCase() + ns.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 sm:flex-none">
              <Select value={reviewFilter} onValueChange={setReviewFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Translations</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed Only</SelectItem>
                  <SelectItem value="reviewed">Reviewed Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search translations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Translation List */}
      {loading ? (
        <div className="flex justify-center items-center py-8 sm:py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filteredTranslations.map((translation) => (
            <Card key={translation.id} className="overflow-hidden">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <CardTitle className="text-sm sm:text-lg font-medium break-all">
                        <span className="text-blue-600">{translation.namespace}</span>
                        <span className="text-gray-400">.</span>
                        <span>{translation.keyPath}</span>
                      </CardTitle>
                      <Badge variant={translation.isApproved ? "default" : "destructive"} className="text-xs self-start sm:self-center">
                        {translation.isApproved ? "Reviewed" : "Needs Review"}
                      </Badge>
                    </div>
                    {translation.context && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Used in: {translation.context}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!translation.isApproved ? (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleApproveTranslation(translation)}
                        className="text-xs px-2 py-1 h-auto"
                      >
                        ✓ Approve
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleUnapproveTranslation(translation)}
                        className="text-xs px-2 py-1 h-auto"
                      >
                        ↶ Needs Review
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditTranslation(translation)}
                      className="text-xs px-2 py-1 h-auto"
                    >
                      <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">Edit</span>
                      <span className="sm:hidden">Edit</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">🇺🇸 English</label>
                    <div className="p-2 sm:p-3 bg-gray-50 rounded border min-h-[50px] sm:min-h-[60px] text-sm">
                      {translation.en || <span className="text-gray-400 italic">No English translation</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium mb-1 sm:mb-2">🇹🇭 Thai</label>
                    <div className="p-2 sm:p-3 bg-gray-50 rounded border min-h-[50px] sm:min-h-[60px] text-sm">
                      {translation.th || <span className="text-gray-400 italic">No Thai translation</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-2 sm:mt-3 gap-1 sm:gap-0">
                  <p className="text-xs text-muted-foreground">
                    Last updated: {translation.lastUpdated ? new Date(translation.lastUpdated).toLocaleDateString() : 'Never'}
                  </p>
                  <p className="text-xs text-muted-foreground sm:text-right">
                    ID: {translation.keyId}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredTranslations.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500">No translations found matching your filters.</p>
                <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filter criteria.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Edit Translation Dialog - Full Screen on Mobile */}
      <Dialog open={!!editingTranslation} onOpenChange={() => setEditingTranslation(null)}>
        <DialogContent className="w-full h-full sm:w-[95vw] sm:h-auto sm:max-w-2xl sm:max-h-[90vh] p-0 sm:p-6 overflow-hidden sm:overflow-y-auto data-[state=open]:duration-300">
          {/* Mobile: Full screen layout */}
          <div className="flex flex-col h-full sm:h-auto">
            {/* Header - Fixed on mobile, normal on desktop */}
            <div className="flex-shrink-0 p-4 sm:p-0 border-b sm:border-b-0 bg-white sm:bg-transparent">
              <DialogHeader className="space-y-3 sm:space-y-2">
                <DialogTitle className="text-lg sm:text-xl font-semibold text-left pr-8">
                  Edit Translation
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">
                    {editingTranslation?.namespace}
                  </span>
                  <span className="text-gray-400 text-sm">•</span>
                  <span className="font-mono text-sm text-gray-700 break-all">
                    {editingTranslation?.keyPath}
                  </span>
                </div>
              </DialogHeader>
            </div>

            {/* Content - Scrollable on mobile */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-0 sm:mt-4">
              <div className="space-y-4 sm:space-y-4 max-w-none">
                <div>
                  <Label htmlFor="en-value" className="text-sm font-medium flex items-center gap-2">
                    🇺🇸 English
                    <span className="text-xs text-gray-500 sm:hidden">
                      ({editValues.en.length} chars)
                    </span>
                  </Label>
                  <Textarea
                    id="en-value"
                    value={editValues.en}
                    onChange={(e) => setEditValues({ ...editValues, en: e.target.value })}
                    className="mt-2 text-base sm:text-sm min-h-[100px] sm:min-h-[80px] resize-none translation-textarea"
                    rows={4}
                    placeholder="Enter English translation..."
                  />
                </div>
                <div>
                  <Label htmlFor="th-value" className="text-sm font-medium flex items-center gap-2">
                    🇹🇭 Thai
                    <span className="text-xs text-gray-500 sm:hidden">
                      ({editValues.th.length} chars)
                    </span>
                  </Label>
                  <Textarea
                    id="th-value"
                    value={editValues.th}
                    onChange={(e) => setEditValues({ ...editValues, th: e.target.value })}
                    className="mt-2 text-base sm:text-sm min-h-[100px] sm:min-h-[80px] resize-none translation-textarea"
                    rows={4}
                    placeholder="Enter Thai translation..."
                  />
                </div>
                <div className="sm:block">
                  <Label htmlFor="reason" className="text-sm font-medium">Change Reason (Optional)</Label>
                  <Input
                    id="reason"
                    value={editValues.reason}
                    onChange={(e) => setEditValues({ ...editValues, reason: e.target.value })}
                    placeholder="Why are you making this change?"
                    className="mt-2 text-base sm:text-sm translation-input"
                  />
                </div>

                {/* Mobile: Add some extra padding at bottom for keyboard */}
                <div className="h-8 sm:hidden" />
              </div>
            </div>

            {/* Footer - Fixed on mobile, normal on desktop */}
            <div className="flex-shrink-0 p-4 sm:p-0 sm:mt-4 border-t sm:border-t-0 bg-white sm:bg-transparent">
              <DialogFooter className="flex-col-reverse sm:flex-row gap-3 sm:gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setEditingTranslation(null)}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveTranslation}
                  className="w-full sm:w-auto order-1 sm:order-2"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}