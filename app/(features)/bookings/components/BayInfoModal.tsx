'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import Image from 'next/image';
import { 
  XMarkIcon, 
  UsersIcon, 
  ComputerDesktopIcon, 
  CheckIcon,
  HandRaisedIcon,
  AcademicCapIcon,
  SparklesIcon,
  VideoCameraIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

interface BayInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BayInfoModal({ isOpen, onClose }: BayInfoModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-xl bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="relative bg-gradient-to-r from-green-600 to-purple-600 px-6 py-4">
                  <Dialog.Title as="h2" className="text-2xl lg:text-3xl font-bold text-center text-white">
                    Choose Your Golf Experience
                  </Dialog.Title>
                  <p className="text-center text-green-100 mt-1">
                    Select the perfect bay type for your skill level and group size
                  </p>
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6 max-h-[80vh] overflow-y-auto">
                  {/* Bay Comparison Grid */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* Social Bays Section */}
                    <div className="border-2 border-green-500 rounded-lg p-6 bg-green-50">
                      <div className="flex items-center mb-4">
                        <div className="bg-green-500 p-2 rounded-full mr-3">
                          <UsersIcon className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-green-800">
                            Social Bays
                          </h3>
                          <span className="px-2 py-1 bg-green-200 text-green-800 text-xs rounded-full font-medium">
                            3 Available
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-gray-700 font-medium">Perfect for beginners, groups, and social play</p>
                        
                        <div className="space-y-2">
                          <h4 className="font-semibold text-green-800 text-sm">Ideal For:</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>New to golf & beginners</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Groups of 3-5 players</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Casual, fun experiences</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Celebrations & parties</span>
                            </li>
                          </ul>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-semibold text-green-800 text-sm">Features:</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>High-quality golf simulators</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Play world-famous courses</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>All skill levels welcome</span>
                            </li>
                            <li className="flex items-start">
                              <CheckIcon className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Social atmosphere</span>
                            </li>
                          </ul>
                        </div>
                        
                        {/* Social Bay Image */}
                        <div className="mt-4">
                          <Image
                            src="/images/bays/social-bay.jpg"
                            alt="Social Bay Experience"
                            width={400}
                            height={160}
                            className="w-full h-40 object-cover rounded-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div className="bg-gray-200 h-40 rounded-lg flex items-center justify-center mt-4 hidden">
                            <span className="text-gray-500 text-sm">Social Bay Experience</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Lab Section */}
                    <div className="border-2 border-purple-500 rounded-lg p-6 bg-purple-50 relative">
                      <div className="absolute -top-3 right-4 bg-purple-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                        NEW!
                      </div>
                      
                      <div className="flex items-center mb-4">
                        <div className="bg-purple-500 p-2 rounded-full mr-3">
                          <ComputerDesktopIcon className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-purple-800">
                            LENGOLF AI Lab
                          </h3>
                          <span className="px-2 py-1 bg-purple-200 text-purple-800 text-xs rounded-full font-medium">
                            1 Available
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <p className="text-gray-700 font-medium">Advanced technology for experienced players</p>
                        
                        <div className="space-y-2">
                          <h4 className="font-semibold text-purple-800 text-sm">Ideal For:</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start">
                              <AcademicCapIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Intermediate+ players</span>
                            </li>
                            <li className="flex items-start">
                              <UsersIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Solo or duo sessions (1-2 players)</span>
                            </li>
                            <li className="flex items-start">
                              <SparklesIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Serious improvement focused</span>
                            </li>
                            <li className="flex items-start">
                              <HandRaisedIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Left & right-handed players</span>
                            </li>
                          </ul>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-semibold text-purple-800 text-sm">Advanced Features:</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex items-start">
                              <SparklesIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>AI-powered swing analysis</span>
                            </li>
                            <li className="flex items-start">
                              <VideoCameraIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Dual-angle video replay</span>
                            </li>
                            <li className="flex items-start">
                              <ComputerDesktopIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>4K course simulation</span>
                            </li>
                            <li className="flex items-start">
                              <HandRaisedIcon className="h-4 w-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span>Left & right-handed optimized setup</span>
                            </li>
                          </ul>
                        </div>
                        
                        {/* AI Lab Image */}
                        <div className="mt-4">
                          <Image
                            src="/images/bays/ai-lab-technology.jpg"
                            alt="AI Lab Technology"
                            width={400}
                            height={160}
                            className="w-full h-40 object-cover rounded-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div className="bg-gray-200 h-40 rounded-lg flex items-center justify-center mt-4 hidden">
                            <span className="text-gray-500 text-sm">AI Lab Technology</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Decision Guide Section */}
                  <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg mb-6">
                    <h4 className="font-semibold text-blue-900 mb-4 flex items-center text-lg">
                      <InformationCircleIcon className="h-5 w-5 mr-2" />
                      Which bay is right for you?
                    </h4>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h5 className="font-medium text-green-800 border-b border-green-200 pb-1">
                          Choose Social Bays if you are:
                        </h5>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>New to golf or still learning</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Playing with 3+ people</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Looking for a casual, fun experience</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Celebrating or having a party</span>
                          </li>
                        </ul>
                      </div>
                      <div className="space-y-3">
                        <h5 className="font-medium text-purple-800 border-b border-purple-200 pb-1">
                          Choose LENGOLF AI Lab if you are:
                        </h5>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>An intermediate+ player</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Playing solo or with 1 partner</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Serious about analyzing your swing</span>
                          </li>
                          <li className="flex items-start">
                            <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                            <span>Looking for optimized setup (left or right-handed)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Launch Poster Reference */}
                  <div className="bg-gradient-to-r from-green-500 to-purple-500 p-6 rounded-lg text-white text-center mb-6">
                    <h4 className="font-bold text-lg mb-2">🚀 Introducing LENGOLF AI Lab</h4>
                    <p className="text-sm opacity-90 mb-3">
                      Advanced AI-powered swing analysis • Dual-angle video replay • 4K course simulation
                    </p>
                    <div className="bg-white/20 rounded p-3">
                      <p className="text-xs font-medium">UNLIMITED SOFT DRINKS with every booking!</p>
                    </div>
                  </div>

                  {/* Close Button */}
                  <div className="text-center">
                    <button
                      onClick={onClose}
                      className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                      I understand - Let me choose
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}