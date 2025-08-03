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
          namespace: item.namespace.namespace,
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
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Translation Management</h1>
        </div>
        
        {/* Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">How to Use</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Edit translations below by clicking the "Edit" button on each card</li>
              <li>Edits are automatically approved when saved</li>
              <li>Use "Unreviewed" filter to see translations that need review</li>
              <li>Run the export script locally: <code className="bg-gray-100 px-2 py-1 rounded text-xs">npx tsx scripts/export-translations-simple.js</code></li>
              <li>Test the changes in your application</li>
              <li>Commit and redeploy your application</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
            <SelectTrigger className="w-48">
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
          <Select value={reviewFilter} onValueChange={setReviewFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Translations</SelectItem>
              <SelectItem value="unreviewed">Unreviewed Only</SelectItem>
              <SelectItem value="reviewed">Reviewed Only</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search translations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Translation List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredTranslations.map((translation) => (
            <Card key={translation.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">
                        {translation.namespace}.{translation.keyPath}
                      </CardTitle>
                      <Badge variant={translation.isApproved ? "default" : "destructive"} className="text-xs">
                        {translation.isApproved ? "Reviewed" : "Needs Review"}
                      </Badge>
                    </div>
                    {translation.context && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Used in: {translation.context}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!translation.isApproved ? (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleApproveTranslation(translation)}
                      >
                        ✓ Approve
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleUnapproveTranslation(translation)}
                      >
                        ↶ Needs Review
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditTranslation(translation)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">English</label>
                    <p className="p-3 bg-gray-50 rounded border min-h-[60px]">{translation.en}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Thai</label>
                    <p className="p-3 bg-gray-50 rounded border min-h-[60px]">{translation.th}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last updated: {translation.lastUpdated ? new Date(translation.lastUpdated).toLocaleString() : 'Never'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Translation Dialog */}
      <Dialog open={!!editingTranslation} onOpenChange={() => setEditingTranslation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit Translation: {editingTranslation?.namespace}.{editingTranslation?.keyPath}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="en-value">English</Label>
              <Textarea
                id="en-value"
                value={editValues.en}
                onChange={(e) => setEditValues({ ...editValues, en: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="th-value">Thai</Label>
              <Textarea
                id="th-value"
                value={editValues.th}
                onChange={(e) => setEditValues({ ...editValues, th: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="reason">Change Reason (Optional)</Label>
              <Input
                id="reason"
                value={editValues.reason}
                onChange={(e) => setEditValues({ ...editValues, reason: e.target.value })}
                placeholder="Why are you making this change?"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTranslation(null)}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleSaveTranslation}>
              <Save className="h-4 w-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}